/**
 * Select Dose (docs/spec/06-decision-pipeline.md#select-dose): dose is chosen purely
 * from this specific exercise's own history -- its most recent prescription and
 * actual performance, target RPE vs. actual RPE, pain vs. painLimit. The spec gives no
 * formula, only a philosophy ("progression should be conservative"); the adjustment
 * percentages and thresholds below are this implementation's chosen, documented,
 * tunable interpretation of that philosophy, not a value derived from the spec.
 *
 * An exercise with zero prior history has nothing to compute a dose from, and the
 * schema has no `defaultPrescription`/starting-dose field (see
 * docs/spec/09-mvp-exercises.md's required-metadata list -- it isn't there). Rather
 * than leaving the client with no prescription at all -- which means no timer/set
 * logger can ever render, since those key off prescription.durationSec/reps -- a
 * conservative starting prescription is synthesized from the exercise's own
 * force/category metadata, the same signal scripts/mock-server.ts's prototype-era
 * synthesizePrescription() used, but fixed values instead of random ranges (this is
 * the real pipeline; the same exercise should start at the same dose for everyone).
 */

import { getPool, type Queryable } from "../db.js";
import { getExercise } from "../derivations/variation.js";

const INCREASE_FACTOR = 1.15;
const DECREASE_FACTOR = 0.85;
const EASY_RPE_MARGIN = 2;
const MIN_DURATION_SEC = 5;
const MIN_REPS = 1;
const DEFAULT_TARGET_RPE = 5;
const DEFAULT_PAIN_LIMIT = 3;

export interface Prescription {
  sets?: number;
  durationSec?: number;
  reps?: number;
  restSec?: number;
  targetRpe?: number;
  painLimit?: number;
  load?: string;
  [key: string]: unknown;
}

interface ActualResult {
  maxPain?: number;
  rpe?: number;
  difficulty?: "too_easy" | "easy" | "normal" | "hard" | "too_hard";
  setsCompleted?: number;
  durationSecCompleted?: number;
  reps?: number;
}

export interface DoseSelection {
  exerciseId: string;
  doseReason: string;
  previous?: { sets?: number; durationSec?: number; reps?: number; maxPain?: number; rpe?: number };
  next?: Prescription;
}

// Same category/force buckets and ordering as scripts/mock-server.ts's
// synthesizePrescription(): cardio checked first since a couple of cardio
// exercises (e.g. mountain_climbers, rope_jumping) have force "push", not null.
function buildDefaultPrescription(metadata: Record<string, unknown>): Prescription {
  if (metadata.category === "cardio") {
    return { sets: 1, durationSec: 900, restSec: 0, targetRpe: DEFAULT_TARGET_RPE, painLimit: DEFAULT_PAIN_LIMIT };
  }
  if (metadata.force === "static") {
    return { sets: 3, durationSec: 30, restSec: 45, targetRpe: DEFAULT_TARGET_RPE, painLimit: DEFAULT_PAIN_LIMIT };
  }
  return { sets: 3, reps: 10, restSec: 45, targetRpe: DEFAULT_TARGET_RPE, painLimit: DEFAULT_PAIN_LIMIT };
}

function adjustPrimaryDoseField(prescribed: Prescription, factor: number): Partial<Prescription> {
  if (typeof prescribed.durationSec === "number") {
    return { durationSec: Math.max(MIN_DURATION_SEC, Math.round(prescribed.durationSec * factor)) };
  }
  if (typeof prescribed.reps === "number") {
    return { reps: Math.max(MIN_REPS, Math.round(prescribed.reps * factor)) };
  }
  return {};
}

export async function selectDose(
  userId: string,
  exerciseId: string,
  pool: Queryable = getPool(),
): Promise<DoseSelection> {
  const { rows } = await pool.query<{ prescribed: Prescription | null; actual: ActualResult }>(
    `
    SELECT prescribed, actual FROM events
    WHERE user_id = $1 AND exercise_id = $2 AND type = 'exercise_result'
    ORDER BY completed_at DESC
    LIMIT 1
    `,
    [userId, exerciseId],
  );

  const mostRecent = rows[0];
  if (!mostRecent || !mostRecent.prescribed) {
    const exercise = await getExercise(exerciseId, pool);
    const next = exercise ? buildDefaultPrescription(exercise.metadata) : undefined;
    return { exerciseId, doseReason: "no_prior_history_using_default_prescription", next };
  }

  const { prescribed, actual } = mostRecent;
  const painExceeded = prescribed.painLimit !== undefined && (actual.maxPain ?? 0) > prescribed.painLimit;
  const tooHard = actual.difficulty === "too_hard" || painExceeded;
  const tooEasy =
    actual.difficulty === "too_easy" &&
    prescribed.targetRpe !== undefined &&
    actual.rpe !== undefined &&
    prescribed.targetRpe - actual.rpe >= EASY_RPE_MARGIN;

  let doseReason: string;
  let adjustment: Partial<Prescription>;
  if (tooHard) {
    doseReason = "reduce_dose_pain_or_difficulty";
    adjustment = adjustPrimaryDoseField(prescribed, DECREASE_FACTOR);
  } else if (tooEasy) {
    doseReason = "increase_dose_slightly";
    adjustment = adjustPrimaryDoseField(prescribed, INCREASE_FACTOR);
  } else {
    doseReason = "maintain_dose";
    adjustment = {};
  }

  return {
    exerciseId,
    doseReason,
    previous: { sets: prescribed.sets, durationSec: prescribed.durationSec, reps: prescribed.reps, maxPain: actual.maxPain, rpe: actual.rpe },
    next: { ...prescribed, ...adjustment },
  };
}
