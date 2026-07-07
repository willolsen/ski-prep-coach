/**
 * Test-only helpers for inserting events (docs/spec/04-history-and-readiness.md#user-activity-history)
 * and readiness entries (docs/spec/04-history-and-readiness.md#readiness-state).
 */

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

export interface ReadinessFixture {
  userId?: string;
  date: string; // 'YYYY-MM-DD'
  painNow?: number;
  morningStiffness?: "none" | "mild" | "significant";
  swelling?: boolean;
  stairs?: "easy" | "difficult" | "unable";
  sleepQuality?: "good" | "fair" | "poor";
  computedStatus: "green" | "yellow" | "red";
}

export async function insertReadinessEntry(db: Queryable, fixture: ReadinessFixture): Promise<void> {
  const {
    userId = "user-001",
    date,
    painNow = 0,
    morningStiffness = "none",
    swelling = false,
    stairs = "easy",
    sleepQuality = "good",
    computedStatus,
  } = fixture;

  const entry = { painNow, morningStiffness, swelling, stairs, sleepQuality };

  await db.query(
    `
    INSERT INTO readiness_entries (user_id, date, entry, computed_status)
    VALUES ($1, $2::date, $3, $4)
    `,
    [userId, date, JSON.stringify(entry), computedStatus],
  );
}
