/** Today's readiness entry (docs/spec/04-history-and-readiness.md#readiness-state). */

import { getPool, type Queryable } from "../db.js";

export interface ReadinessEntry {
  painNow: number;
  morningStiffness: "none" | "mild" | "significant";
  swelling: boolean;
  stairs: "easy" | "difficult" | "unable";
  sleepQuality: "good" | "fair" | "poor";
}

export interface TodayReadiness {
  entry: ReadinessEntry;
  computedStatus: "green" | "yellow" | "red";
}

/** `date` is derived from (now, timezone) the same way Submit Readiness derives it at write time. */
export async function getTodayReadiness(
  userId: string,
  timezone: string,
  now: Date,
  pool: Queryable = getPool(),
): Promise<TodayReadiness | null> {
  const { rows } = await pool.query<{ entry: ReadinessEntry; computed_status: TodayReadiness["computedStatus"] }>(
    `
    SELECT entry, computed_status
    FROM readiness_entries
    WHERE user_id = $1 AND date = ($2::timestamptz AT TIME ZONE $3)::date
    `,
    [userId, now.toISOString(), timezone],
  );

  const row = rows[0];
  return row ? { entry: row.entry, computedStatus: row.computed_status } : null;
}
