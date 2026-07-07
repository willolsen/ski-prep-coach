/** Test-only helper for inserting events (docs/spec/04-history-and-readiness.md#user-activity-history). */

import type { Queryable } from "../db.js";

export interface EventFixture {
  userId?: string;
  exerciseId: string;
  timezone?: string;
  completedAt: Date | string;
  prescribed?: Record<string, unknown> | null;
  actual?: Record<string, unknown>;
  doseRatio?: number;
  cleanCompletion?: boolean;
}

export async function insertExerciseResultEvent(db: Queryable, fixture: EventFixture): Promise<void> {
  const {
    userId = "user-001",
    exerciseId,
    timezone = "UTC",
    completedAt,
    prescribed = null,
    actual = {},
    doseRatio = 1,
    cleanCompletion = true,
  } = fixture;

  const completedAtIso = completedAt instanceof Date ? completedAt.toISOString() : completedAt;

  await db.query(
    `
    INSERT INTO events (
      user_id, type, source, exercise_id, timezone, started_at, completed_at,
      prescribed, actual, dose_ratio, clean_completion
    )
    VALUES ($1, 'exercise_result', 'live', $2, $3, $4::timestamptz, $4::timestamptz, $5, $6, $7, $8)
    `,
    [
      userId,
      exerciseId,
      timezone,
      completedAtIso,
      prescribed ? JSON.stringify(prescribed) : null,
      JSON.stringify(actual),
      doseRatio,
      cleanCompletion,
    ],
  );
}
