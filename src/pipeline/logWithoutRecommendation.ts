/**
 * Logging Without a Recommendation (docs/spec/05-server-api.md#logging-without-a-recommendation):
 * onboarding backfill and self-directed logging share one mechanism -- ordinary
 * exercise_result events with no recommendationId and no prescribed block. Sequential
 * inserts, not Promise.all: `pool` may be a single reserved connection (a test running
 * inside a transaction), and concurrent queries on one connection are a deprecated
 * node-postgres pattern (same reasoning as the derivation modules).
 */

import { getPool, type Queryable } from "../db.js";
import { computeDoseRatio, computeCleanCompletion, type Actual } from "./eventDerivedFields.js";

export interface LogEntry {
  exerciseId: string;
  source: "onboarding" | "self_directed";
  timezone: string;
  occurredAt: string;
  actual: Actual;
}

export async function logEntries(userId: string, entries: LogEntry[], pool: Queryable = getPool()): Promise<string[]> {
  const eventIds: string[] = [];

  for (const entry of entries) {
    const doseRatio = computeDoseRatio(null, entry.actual);
    const cleanCompletion = computeCleanCompletion(null, entry.actual);

    const { rows } = await pool.query<{ event_id: string }>(
      `
      INSERT INTO events (
        user_id, type, source, exercise_id, timezone, started_at, completed_at,
        prescribed, actual, dose_ratio, clean_completion
      )
      VALUES ($1, 'exercise_result', $2, $3, $4, $5::timestamptz, $5::timestamptz, NULL, $6, $7, $8)
      RETURNING event_id
      `,
      [userId, entry.source, entry.exerciseId, entry.timezone, entry.occurredAt, JSON.stringify(entry.actual), doseRatio, cleanCompletion],
    );

    eventIds.push(rows[0]!.event_id);
  }

  return eventIds;
}
