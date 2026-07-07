/**
 * Submit Readiness (docs/spec/05-server-api.md#submit-readiness). `date` is derived
 * from (now, timezone) rather than submitted directly, so it can never disagree with
 * every other day-boundary calculation in the system. `computedStatus` is derived and
 * stored at submission time (docs/spec/04-history-and-readiness.md#readiness-state)
 * from the submitted fields plus aggregateFatigue computed fresh as of this same
 * `now` -- the one history-dependent derived value this spec persists rather than
 * recomputing on read, since it needs to be cheap to check on every later GET /next.
 */

import { getPool, type Queryable } from "../db.js";
import { getAggregateFatigue } from "../derivations/fatigueWarmth.js";

export interface ReadinessStatusInput {
  painNow: number;
  swelling: boolean;
  stairs: "easy" | "difficult" | "unable";
  sleepQuality: "good" | "fair" | "poor";
  aggregateFatigue: number;
}

export function computeReadinessStatus(input: ReadinessStatusInput): "green" | "yellow" | "red" {
  if (input.swelling || input.stairs === "difficult" || input.stairs === "unable" || input.painNow >= 4) {
    return "red";
  }
  if (input.painNow >= 2 || input.sleepQuality === "poor" || input.aggregateFatigue >= 60) {
    return "yellow";
  }
  return "green";
}

export interface SubmitReadinessBody {
  now?: string;
  timezone: string;
  painNow: number;
  morningStiffness: "none" | "mild" | "significant";
  swelling: boolean;
  stairs: "easy" | "difficult" | "unable";
  sleepQuality: "good" | "fair" | "poor";
}

export interface SubmitReadinessResult {
  date: string;
  computedStatus: "green" | "yellow" | "red";
}

async function deriveDate(now: Date, timezone: string, pool: Queryable): Promise<string> {
  // pg returns `date` columns as JS Date objects by default; cast to text so callers
  // (and the readiness_entries row itself) get the plain 'YYYY-MM-DD' string the API
  // response shape expects.
  const { rows } = await pool.query<{ date: string }>(
    `SELECT (($1::timestamptz AT TIME ZONE $2)::date)::text AS date`,
    [now.toISOString(), timezone],
  );
  return rows[0]!.date;
}

export async function submitReadiness(
  userId: string,
  body: SubmitReadinessBody,
  pool: Queryable = getPool(),
): Promise<SubmitReadinessResult> {
  const now = new Date(body.now ?? new Date().toISOString());
  const date = await deriveDate(now, body.timezone, pool);
  const aggregateFatigue = await getAggregateFatigue(userId, now, pool);

  const computedStatus = computeReadinessStatus({
    painNow: body.painNow,
    swelling: body.swelling,
    stairs: body.stairs,
    sleepQuality: body.sleepQuality,
    aggregateFatigue,
  });

  const entry = {
    painNow: body.painNow,
    morningStiffness: body.morningStiffness,
    swelling: body.swelling,
    stairs: body.stairs,
    sleepQuality: body.sleepQuality,
  };

  await pool.query(
    `
    INSERT INTO readiness_entries (user_id, date, entry, computed_status)
    VALUES ($1, $2::date, $3, $4)
    ON CONFLICT (user_id, date) DO UPDATE SET entry = EXCLUDED.entry, computed_status = EXCLUDED.computed_status
    `,
    [userId, date, JSON.stringify(entry), computedStatus],
  );

  return { date, computedStatus };
}
