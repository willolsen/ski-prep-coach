/**
 * Safety veto (docs/spec/06-decision-pipeline.md#safety-veto): immediately recommend
 * rest, overriding every performance goal, if any of these hold. Checked against
 * today's readiness entry directly (not just its stored computedStatus alone) and
 * against aggregateFatigue computed fresh as of `now` -- fatigue can rise past the
 * unsafe threshold later in the day even on a readiness entry submitted this morning.
 *
 * The spec's "severe next-morning pain response" has no field in the data model
 * distinct from today's own painNow, so it isn't checked as a separate condition here.
 */

import { getPool, type Queryable } from "../db.js";
import { getAggregateFatigue } from "../derivations/fatigueWarmth.js";

const PAIN_TOO_HIGH_THRESHOLD = 4;
const UNSAFE_AGGREGATE_FATIGUE_THRESHOLD = 100;

export interface SafetyVetoResult {
  vetoed: boolean;
  reasonCodes: string[];
}

interface ReadinessRow {
  entry: { painNow: number; swelling: boolean; stairs: "easy" | "difficult" | "unable" };
  computed_status: "green" | "yellow" | "red";
}

export async function checkSafetyVeto(
  userId: string,
  timezone: string,
  now: Date,
  pool: Queryable = getPool(),
): Promise<SafetyVetoResult> {
  const { rows } = await pool.query<ReadinessRow>(
    `
    SELECT entry, computed_status
    FROM readiness_entries
    WHERE user_id = $1 AND date = ($2::timestamptz AT TIME ZONE $3)::date
    `,
    [userId, now.toISOString(), timezone],
  );
  const readiness = rows[0] ?? null;

  const reasonCodes: string[] = [];

  if (readiness) {
    if (readiness.entry.painNow >= PAIN_TOO_HIGH_THRESHOLD) reasonCodes.push("pain_too_high");
    if (readiness.entry.swelling) reasonCodes.push("swelling_reported");
    if (readiness.entry.stairs === "difficult" || readiness.entry.stairs === "unable") {
      reasonCodes.push("limp_or_instability");
    }
    if (readiness.computed_status === "red") reasonCodes.push("safety_red_day");
  }

  const aggregateFatigue = await getAggregateFatigue(userId, now, pool);
  if (aggregateFatigue >= UNSAFE_AGGREGATE_FATIGUE_THRESHOLD) {
    reasonCodes.push("unsafe_fatigue_accumulation");
  }

  return { vetoed: reasonCodes.length > 0, reasonCodes };
}
