/**
 * Substitutes, regressions, and progressions
 * (docs/spec/13-data-layer.md#substitutes-regressions-and-progressions) — computed from
 * familyId/movementPattern/progressionLevel at query time, since exercises don't
 * reference each other (docs/spec/03-exercises-and-recovery.md#exercise-definition).
 */

import { getPool, type Queryable } from "../db.js";

export interface Exercise {
  exerciseId: string;
  baseSource: string;
  movementPattern: string;
  familyId: string;
  progressionLevel: number;
  recoveryClass: string;
  riskLevel: string;
  generalWarmthRequired: number;
  movementPatternWarmthRequired: number;
  fatigueCost: number;
  warmthEffect: number;
  capabilityEffects: Record<string, number>;
  metadata: Record<string, unknown>;
}

interface ExerciseRow {
  exercise_id: string;
  base_source: string;
  movement_pattern: string;
  family_id: string;
  progression_level: number;
  recovery_class: string;
  risk_level: string;
  general_warmth_required: number;
  movement_pattern_warmth_required: number;
  fatigue_cost: number;
  warmth_effect: number;
  capability_effects: Record<string, number>;
  metadata: Record<string, unknown>;
}

const EXERCISE_COLUMNS = `
  exercise_id, base_source, movement_pattern, family_id, progression_level,
  recovery_class, risk_level, general_warmth_required, movement_pattern_warmth_required,
  fatigue_cost, warmth_effect, capability_effects, metadata
`;

function mapExercise(row: ExerciseRow): Exercise {
  return {
    exerciseId: row.exercise_id,
    baseSource: row.base_source,
    movementPattern: row.movement_pattern,
    familyId: row.family_id,
    progressionLevel: row.progression_level,
    recoveryClass: row.recovery_class,
    riskLevel: row.risk_level,
    generalWarmthRequired: row.general_warmth_required,
    movementPatternWarmthRequired: row.movement_pattern_warmth_required,
    fatigueCost: row.fatigue_cost,
    warmthEffect: row.warmth_effect,
    capabilityEffects: row.capability_effects,
    metadata: row.metadata,
  };
}

export async function getExercise(exerciseId: string, pool: Queryable = getPool()): Promise<Exercise | null> {
  const { rows } = await pool.query<ExerciseRow>(
    `SELECT ${EXERCISE_COLUMNS} FROM exercises WHERE exercise_id = $1`,
    [exerciseId],
  );
  return rows[0] ? mapExercise(rows[0]) : null;
}

export async function getAllExercises(pool: Queryable = getPool()): Promise<Exercise[]> {
  const { rows } = await pool.query<ExerciseRow>(`SELECT ${EXERCISE_COLUMNS} FROM exercises`);
  return rows.map(mapExercise);
}

/** Same family first; falls back to same movementPattern if the family has no other eligible members. */
export async function getSubstitutes(exerciseId: string, pool: Queryable = getPool()): Promise<Exercise[]> {
  const { rows } = await pool.query<ExerciseRow>(
    `
    SELECT ${EXERCISE_COLUMNS} FROM exercises
    WHERE exercise_id != $1
      AND (
        family_id = (SELECT family_id FROM exercises WHERE exercise_id = $1)
        OR movement_pattern = (SELECT movement_pattern FROM exercises WHERE exercise_id = $1)
      )
    ORDER BY (family_id = (SELECT family_id FROM exercises WHERE exercise_id = $1)) DESC, progression_level
    `,
    [exerciseId],
  );
  return rows.map(mapExercise);
}

async function nearestByProgression(
  exerciseId: string,
  direction: "below" | "above",
  pool: Queryable,
): Promise<Exercise | null> {
  // Sequential, not Promise.all: `pool` may be a single reserved connection (a test
  // running inside a transaction), and concurrent queries on one connection are a
  // deprecated pattern in node-postgres.
  const self = await getExercise(exerciseId, pool);
  const substitutes = await getSubstitutes(exerciseId, pool);
  if (!self) return null;

  const sameFamily = substitutes.filter((e) => e.familyId === self.familyId);
  const candidates = sameFamily.length > 0 ? sameFamily : substitutes;

  const filtered = candidates.filter((e) =>
    direction === "below" ? e.progressionLevel < self.progressionLevel : e.progressionLevel > self.progressionLevel,
  );
  if (filtered.length === 0) return null;

  return direction === "below"
    ? filtered.reduce((closest, e) => (e.progressionLevel > closest.progressionLevel ? e : closest))
    : filtered.reduce((closest, e) => (e.progressionLevel < closest.progressionLevel ? e : closest));
}

/** The nearest progressionLevel below exerciseId's own, from its substitute set (same family first). */
export async function getRegression(exerciseId: string, pool: Queryable = getPool()): Promise<Exercise | null> {
  return nearestByProgression(exerciseId, "below", pool);
}

/** The nearest progressionLevel above exerciseId's own, from its substitute set (same family first). */
export async function getProgression(exerciseId: string, pool: Queryable = getPool()): Promise<Exercise | null> {
  return nearestByProgression(exerciseId, "above", pool);
}
