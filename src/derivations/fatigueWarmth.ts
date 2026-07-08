/**
 * Fatigue and warmth (docs/spec/07-result-processing.md#fatigue,
 * docs/spec/07-result-processing.md#warmth; queries from
 * docs/spec/13-data-layer.md#deriving-fatigue-and-warmth). Both are decayed sums, not
 * compounding folds, so `now` is threaded straight into the query rather than replayed
 * event-by-event in application code.
 */

import { getPool, type Queryable } from "../db.js";

export interface BucketFatigue {
  movementPattern: string;
  recoveryClass: string;
  bucketFatigue: number;
}

export async function getBucketFatigue(userId: string, now: Date, pool: Queryable = getPool()): Promise<BucketFatigue[]> {
  const { rows } = await pool.query<{
    movement_pattern: string;
    recovery_class: string;
    bucket_fatigue: number | null;
  }>(
    `
    SELECT
      x.movement_pattern, x.recovery_class,
      SUM(e.dose_ratio * x.fatigue_cost *
          POWER(0.5, EXTRACT(EPOCH FROM ($2::timestamptz - e.completed_at)) / 3600.0 / rc.half_life_hours)
      ) AS bucket_fatigue
    FROM events e
    JOIN exercises x ON x.exercise_id = e.exercise_id
    JOIN recovery_classes rc ON rc.recovery_class = x.recovery_class
    WHERE e.user_id = $1 AND e.type = 'exercise_result'
    GROUP BY x.movement_pattern, x.recovery_class
    `,
    [userId, now.toISOString()],
  );

  return rows.map((r) => ({
    movementPattern: r.movement_pattern,
    recoveryClass: r.recovery_class,
    bucketFatigue: r.bucket_fatigue ?? 0,
  }));
}

/** aggregateFatigue (docs/spec/04-history-and-readiness.md#readiness-state): the single highest current bucket fatigue. */
export async function getAggregateFatigue(userId: string, now: Date, pool: Queryable = getPool()): Promise<number> {
  const buckets = await getBucketFatigue(userId, now, pool);
  return buckets.reduce((max, b) => Math.max(max, b.bucketFatigue), 0);
}

export const MOVEMENT_PATTERNS = ["squat", "hinge", "lunge", "push", "pull", "rotation", "gait_locomotion"] as const;

export interface Warmth {
  general: number;
  byMovementPattern: Record<(typeof MOVEMENT_PATTERNS)[number], number>;
}

export async function getWarmth(userId: string, now: Date, pool: Queryable = getPool()): Promise<Warmth> {
  const nowIso = now.toISOString();

  // Sequential, not Promise.all: `pool` may be a single reserved connection (a test
  // running inside a transaction), and concurrent queries on one connection are a
  // deprecated pattern in node-postgres.
  const generalResult = await pool.query<{ general_warmth: number | null }>(
    `
    SELECT SUM(
      e.dose_ratio * x.warmth_effect *
      POWER(0.5, EXTRACT(EPOCH FROM ($2::timestamptz - e.completed_at)) / 60.0 / 20.0)
    ) AS general_warmth
    FROM events e
    JOIN exercises x ON x.exercise_id = e.exercise_id
    WHERE e.user_id = $1 AND e.completed_at > $2::timestamptz - interval '3 hours'
    `,
    [userId, nowIso],
  );

  const patternResult = await pool.query<{ movement_pattern: string; pattern_warmth: number | null }>(
    `
    SELECT
      x.movement_pattern,
      SUM(e.dose_ratio * x.warmth_effect *
          POWER(0.5, EXTRACT(EPOCH FROM ($2::timestamptz - e.completed_at)) / 60.0 / 20.0)
      ) AS pattern_warmth
    FROM events e
    JOIN exercises x ON x.exercise_id = e.exercise_id
    WHERE e.user_id = $1 AND e.completed_at > $2::timestamptz - interval '3 hours'
    GROUP BY x.movement_pattern
    `,
    [userId, nowIso],
  );

  const byMovementPattern = Object.fromEntries(MOVEMENT_PATTERNS.map((p) => [p, 0])) as Warmth["byMovementPattern"];
  for (const row of patternResult.rows) {
    if (row.movement_pattern in byMovementPattern) {
      byMovementPattern[row.movement_pattern as (typeof MOVEMENT_PATTERNS)[number]] = row.pattern_warmth ?? 0;
    }
  }

  return {
    general: generalResult.rows[0]?.general_warmth ?? 0,
    byMovementPattern,
  };
}

export type WarmthLabel = "cold" | "slightly_warm" | "warm" | "very_warm";

/** Suggested display states for general warmth only (docs/spec/04-history-and-readiness.md#warmth-state). */
export function warmthLabel(general: number): WarmthLabel {
  if (general >= 70) return "very_warm";
  if (general >= 40) return "warm";
  if (general >= 20) return "slightly_warm";
  return "cold";
}
