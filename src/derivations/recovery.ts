/**
 * Recovery eligibility, pain risk, daily progress, and variation history
 * (docs/spec/13-data-layer.md#the-rest-recovery-eligibility-pain-risk-daily-progress).
 */

import { getPool, type Queryable } from "../db.js";

export interface RecoveryStatus {
  lastDoneAt: string | null;
  todayCount: number;
  weekCount: number;
  eligible: boolean;
}

/**
 * Hard eligibility gate for one (movementPattern, recoveryClass) bucket, checked
 * against that recovery class's minRestHours/maxPerDay/maxPerWeek
 * (docs/spec/03-exercises-and-recovery.md#recovery-classes). Independent of decayed
 * fatigue (docs/spec/07-result-processing.md#fatigue), which is a separate soft signal.
 */
export async function getRecoveryStatus(
  userId: string,
  movementPattern: string,
  recoveryClass: string,
  now: Date,
  pool: Queryable = getPool(),
): Promise<RecoveryStatus> {
  const nowIso = now.toISOString();

  // Sequential, not Promise.all: `pool` may be a single reserved connection (a test
  // running inside a transaction), and concurrent queries on one connection are a
  // deprecated pattern in node-postgres.
  const statsResult = await pool.query<{ last_done_at: string | null; today_count: number; week_count: number }>(
    `
    SELECT
      MAX(e.completed_at) AS last_done_at,
      COUNT(*) FILTER (WHERE e.completed_at > $4::timestamptz - interval '1 day') AS today_count,
      COUNT(*) FILTER (WHERE e.completed_at > $4::timestamptz - interval '7 days') AS week_count
    FROM events e
    JOIN exercises x ON x.exercise_id = e.exercise_id
    WHERE e.user_id = $1 AND x.movement_pattern = $2 AND x.recovery_class = $3
    `,
    [userId, movementPattern, recoveryClass, nowIso],
  );

  const classResult = await pool.query<{ min_rest_hours: number; max_per_day: number; max_per_week: number }>(
    `SELECT min_rest_hours, max_per_day, max_per_week FROM recovery_classes WHERE recovery_class = $1`,
    [recoveryClass],
  );

  const stats = statsResult.rows[0]!;
  const recoveryClassDef = classResult.rows[0];
  if (!recoveryClassDef) {
    throw new Error(`Unknown recovery class "${recoveryClass}"`);
  }

  const hoursSinceLastDone = stats.last_done_at
    ? (now.getTime() - new Date(stats.last_done_at).getTime()) / 3_600_000
    : Infinity;

  const eligible =
    hoursSinceLastDone >= recoveryClassDef.min_rest_hours &&
    stats.today_count < recoveryClassDef.max_per_day &&
    stats.week_count < recoveryClassDef.max_per_week;

  return { lastDoneAt: stats.last_done_at, todayCount: stats.today_count, weekCount: stats.week_count, eligible };
}

export interface PainRisk {
  elevatedRisk: boolean;
  mostRecentEvent: { exerciseId: string; completedAt: string; maxPain: number | null } | null;
}

/**
 * elevatedRisk (docs/spec/07-result-processing.md#pain-risk): true if the single most
 * recent event among exerciseId and its computed regressions/substitutes had maxPain
 * exceeding that same event's own prescribed painLimit. The spec's "or an early stop
 * due to discomfort" half of this rule has no dedicated schema field yet, so it isn't
 * checked here.
 */
export async function getPainRisk(userId: string, exerciseIds: string[], pool: Queryable = getPool()): Promise<PainRisk> {
  if (exerciseIds.length === 0) return { elevatedRisk: false, mostRecentEvent: null };

  const { rows } = await pool.query<{
    exercise_id: string;
    completed_at: string;
    actual: { maxPain?: number };
    prescribed: { painLimit?: number } | null;
  }>(
    `
    SELECT exercise_id, completed_at, actual, prescribed
    FROM events
    WHERE user_id = $1 AND exercise_id = ANY($2) AND type = 'exercise_result'
    ORDER BY completed_at DESC
    LIMIT 1
    `,
    [userId, exerciseIds],
  );

  const row = rows[0];
  if (!row) return { elevatedRisk: false, mostRecentEvent: null };

  const maxPain = row.actual?.maxPain ?? null;
  const painLimit = row.prescribed?.painLimit ?? null;
  const elevatedRisk = maxPain !== null && painLimit !== null && maxPain > painLimit;

  return { elevatedRisk, mostRecentEvent: { exerciseId: row.exercise_id, completedAt: row.completed_at, maxPain } };
}

export interface DailyProgress {
  capabilityStimulus: Record<string, number>;
  currentStimulusScore: number;
}

/**
 * Daily progress (docs/spec/07-result-processing.md#daily-progress,
 * docs/spec/08-daily-progress.md): sum of stimulusEarned per capability across today's
 * events, regardless of whether a given event's capability-score contribution was
 * skipped. "Today" is each event's own stored timezone placing it on the same calendar
 * date as (now, timezone) supplied with the current request.
 */
export async function getDailyProgress(
  userId: string,
  timezone: string,
  now: Date,
  pool: Queryable = getPool(),
): Promise<DailyProgress> {
  const { rows } = await pool.query<{ capability_id: string; stimulus_earned: number }>(
    `
    SELECT
      ce.key AS capability_id,
      SUM((ce.value::numeric) * e.dose_ratio) AS stimulus_earned
    FROM events e
    JOIN exercises x ON x.exercise_id = e.exercise_id
    CROSS JOIN LATERAL jsonb_each_text(x.capability_effects) AS ce(key, value)
    WHERE e.type = 'exercise_result' AND e.user_id = $1
      AND (e.completed_at AT TIME ZONE e.timezone)::date = ($3::timestamptz AT TIME ZONE $2)::date
    GROUP BY ce.key
    `,
    [userId, timezone, now.toISOString()],
  );

  const capabilityStimulus: Record<string, number> = {};
  let currentStimulusScore = 0;
  for (const row of rows) {
    capabilityStimulus[row.capability_id] = row.stimulus_earned;
    currentStimulusScore += row.stimulus_earned;
  }

  return { capabilityStimulus, currentStimulusScore };
}

export interface VariationHistoryEntry {
  exerciseId: string;
  movementPattern: string;
  familyId: string;
  completedAt: string;
}

/** Recently repeated movement pattern/family/exercise (docs/spec/07-result-processing.md#variation-history). */
export async function getVariationHistory(
  userId: string,
  days: number,
  now: Date,
  pool: Queryable = getPool(),
): Promise<VariationHistoryEntry[]> {
  const { rows } = await pool.query<{
    exercise_id: string;
    movement_pattern: string;
    family_id: string;
    completed_at: string;
  }>(
    `
    SELECT e.exercise_id, x.movement_pattern, x.family_id, e.completed_at
    FROM events e
    JOIN exercises x ON x.exercise_id = e.exercise_id
    WHERE e.user_id = $1 AND e.type = 'exercise_result'
      AND e.completed_at > $2::timestamptz - make_interval(days => $3)
    ORDER BY e.completed_at DESC
    `,
    [userId, now.toISOString(), days],
  );

  return rows.map((r) => ({
    exerciseId: r.exercise_id,
    movementPattern: r.movement_pattern,
    familyId: r.family_id,
    completedAt: r.completed_at,
  }));
}
