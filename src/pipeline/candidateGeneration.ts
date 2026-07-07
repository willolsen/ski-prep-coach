/**
 * Generate Candidate Actions (docs/spec/06-decision-pipeline.md#generate-candidate-actions):
 * every exercise in the library, checked against the eligibility criteria that gate it
 * out of consideration entirely. Scoring, variation selection, and dose come later
 * (docs/spec/06-decision-pipeline.md#score-candidate-actions onward) -- this step only
 * decides which exercises are even in play.
 *
 * The user profile (availableEquipment, movementPatternRestrictions) is passed in
 * rather than fetched here, since it's raw state the pipeline's Load State step
 * already loaded (docs/spec/06-decision-pipeline.md#load-state) -- this step consumes
 * it, it doesn't reload it.
 */

import { getPool, type Queryable } from "../db.js";
import { getCapabilityScores, getCapabilityTargets } from "../derivations/capabilityScore.js";
import { getWarmth } from "../derivations/fatigueWarmth.js";
import { getRecoveryStatus, getPainRisk } from "../derivations/recovery.js";
import { getTodayReadiness } from "../derivations/readiness.js";
import { getAllExercises, getRegression, type Exercise } from "../derivations/variation.js";

export interface CandidateProfile {
  availableEquipment: string[];
  movementPatternRestrictions: Record<string, "mild" | "avoid">;
}

export interface CandidateEligibility {
  exerciseId: string;
  eligible: boolean;
  reasonCodes: string[];
}

// The free-exercise-db equipment enum doesn't share a vocabulary with the user
// profile's availableEquipment list. "gym" is treated as blanket access to standard
// gym equipment; "other" (which covers cycling, hiking, rollerblading, court sports,
// and reaction drills in the seeded set) has no controlled-vocabulary link to the
// profile's activity-specific entries (bike/rollerblades/hiking_trails/pickleball_court)
// yet, so it's treated as unblockable rather than guessing a mapping the spec doesn't define.
const GYM_ONLY_EQUIPMENT_ALIASES: Record<string, string> = {
  dumbbell: "dumbbells",
  barbell: "barbell",
};

function hasRequiredEquipment(equipment: unknown, availableEquipment: string[]): boolean {
  if (equipment === null || equipment === undefined || equipment === "body only" || equipment === "other") {
    return true;
  }
  if (availableEquipment.includes("gym")) return true;
  const alias = GYM_ONLY_EQUIPMENT_ALIASES[equipment as string];
  return alias !== undefined && availableEquipment.includes(alias);
}

function isCapabilityUseful(
  exercise: Exercise,
  capabilityScores: Record<string, { score: number }>,
  capabilityTargets: Record<string, number>,
): boolean {
  return Object.keys(exercise.capabilityEffects).some((capabilityId) => {
    const score = capabilityScores[capabilityId]?.score ?? 0;
    const target = capabilityTargets[capabilityId] ?? Infinity;
    return score < target;
  });
}

export async function generateCandidates(
  userId: string,
  timezone: string,
  now: Date,
  profile: CandidateProfile,
  pool: Queryable = getPool(),
): Promise<CandidateEligibility[]> {
  const exercises = await getAllExercises(pool);
  const capabilityScores = await getCapabilityScores(userId, pool);
  const capabilityTargets = await getCapabilityTargets(pool);
  const warmth = await getWarmth(userId, now, pool);
  // Only "red" is concretely defined as an eligibility-gating condition here; the spec
  // says yellow readiness also restricts candidates but doesn't define which beyond
  // what movementPatternRestrictions/warmth/recovery already cover.
  const readiness = await getTodayReadiness(userId, timezone, now, pool);

  const recoveryStatusByBucket = new Map<string, boolean>();
  for (const exercise of exercises) {
    const bucketKey = `${exercise.movementPattern}|${exercise.recoveryClass}`;
    if (!recoveryStatusByBucket.has(bucketKey)) {
      const status = await getRecoveryStatus(userId, exercise.movementPattern, exercise.recoveryClass, now, pool);
      recoveryStatusByBucket.set(bucketKey, status.eligible);
    }
  }

  const results: CandidateEligibility[] = [];

  for (const exercise of exercises) {
    const reasonCodes: string[] = [];

    if (!hasRequiredEquipment(exercise.metadata.equipment, profile.availableEquipment)) {
      reasonCodes.push("missing_equipment");
    }

    const restriction = profile.movementPatternRestrictions[exercise.movementPattern];
    if (restriction === "avoid") {
      reasonCodes.push("movement_pattern_avoided");
    } else if (restriction === "mild" && exercise.recoveryClass !== "daily" && exercise.recoveryClass !== "light") {
      reasonCodes.push("movement_pattern_mild_restriction");
    }

    if (readiness?.computedStatus === "red") {
      reasonCodes.push("readiness_red");
    }

    if (
      warmth.general < exercise.generalWarmthRequired ||
      (warmth.byMovementPattern[exercise.movementPattern as keyof typeof warmth.byMovementPattern] ?? 0) <
        exercise.movementPatternWarmthRequired
    ) {
      reasonCodes.push("not_warm_enough");
    }

    const bucketKey = `${exercise.movementPattern}|${exercise.recoveryClass}`;
    if (!recoveryStatusByBucket.get(bucketKey)) {
      reasonCodes.push("recovery_not_eligible");
    }

    if (!isCapabilityUseful(exercise, capabilityScores, capabilityTargets)) {
      reasonCodes.push("capability_targets_already_met");
    }

    const regression = await getRegression(exercise.exerciseId, pool);
    const painRiskIds = regression ? [exercise.exerciseId, regression.exerciseId] : [exercise.exerciseId];
    const painRisk = await getPainRisk(userId, painRiskIds, pool);
    if (painRisk.elevatedRisk && !regression) {
      reasonCodes.push("elevated_risk_no_regression");
    }

    results.push({ exerciseId: exercise.exerciseId, eligible: reasonCodes.length === 0, reasonCodes });
  }

  return results;
}
