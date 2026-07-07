/**
 * Score Candidate Actions (docs/spec/06-decision-pipeline.md#score-candidate-actions).
 * Split into a pure formula (computeScore) and a DB-orchestrating wrapper
 * (scoreCandidates) that gathers the formula's inputs -- keeping the formula itself
 * trivially unit-testable with plain object literals, no database required.
 *
 * limitingCapabilityIds is a parameter, not recomputed here: Identify Limiting
 * Capabilities (docs/spec/06-decision-pipeline.md#identify-limiting-capabilities) runs
 * once, earlier in the documented pipeline order, and its result is consumed here.
 *
 * "Liked activity" (docs/spec/02-capabilities.md#user-profile's preferences.likes) has
 * no dedicated tag field linking it to specific exercises in the current schema --
 * variantTags on the seeded exercises (e.g. "outdoor", "steady_state") don't encode
 * activity names. Matched here via a case-insensitive substring check against the
 * exercise's own name instead, since that's the only field that actually contains
 * matchable text ("Zone 2 Trail Hiking" vs. a "hiking" preference).
 */

import { getPool, type Queryable } from "../db.js";
import { getBucketFatigue } from "../derivations/fatigueWarmth.js";
import { getPainRisk, getVariationHistory } from "../derivations/recovery.js";
import { getAllExercises, getRegression, type Exercise } from "../derivations/variation.js";
import { getCapabilityPriorities } from "../derivations/capabilityScore.js";

const ENJOYMENT_BONUS = 10;
const RISK_LEVEL_BASELINE_PENALTY: Record<string, number> = { low: 0, moderate: 5, high: 15 };
const ELEVATED_RISK_PENALTY = 30;
const LIMITING_CAPABILITY_BOOST = 1.5;
const LOW_FATIGUE_THRESHOLD = 30;
const NEGLIGIBLE_REPETITION_PENALTY = 1;

// The spec says repetitionPenalty is "recency-decayed over ~3 days" without a formula;
// this half-life makes it roughly negligible by day 3, echoed in NEGLIGIBLE_REPETITION_PENALTY.
const REPETITION_PENALTY_BASE = 15;
const REPETITION_PENALTY_HALF_LIFE_DAYS = 1;
const REPETITION_PENALTY_LOOKBACK_DAYS = 10;

export interface ScoringInput {
  capabilityEffects: Record<string, number>;
  capabilityPriorities: Record<string, number>;
  limitingCapabilityIds: ReadonlySet<string>;
  isLikedActivity: boolean;
  fatigueCost: number;
  currentBucketFatigue: number;
  repetitionPenalty: number;
  riskLevel: "low" | "moderate" | "high";
  elevatedRisk: boolean;
}

export interface ScoreResult {
  score: number;
  reasonCodes: string[];
}

export function computeScore(input: ScoringInput): ScoreResult {
  const reasonCodes: string[] = [];
  let score = 0;

  let trainsLimitingCapability = false;
  for (const [capabilityId, effect] of Object.entries(input.capabilityEffects)) {
    const priority = input.capabilityPriorities[capabilityId] ?? 0;
    const isLimiting = input.limitingCapabilityIds.has(capabilityId);
    if (isLimiting) trainsLimitingCapability = true;
    score += effect * (priority / 10) * (isLimiting ? LIMITING_CAPABILITY_BOOST : 1.0);
  }
  if (trainsLimitingCapability) reasonCodes.push("trains_limiting_capability");

  if (input.isLikedActivity) {
    score += ENJOYMENT_BONUS;
    reasonCodes.push("liked_activity");
  }

  score -= input.fatigueCost * (input.currentBucketFatigue / 100);
  if (input.currentBucketFatigue < LOW_FATIGUE_THRESHOLD) reasonCodes.push("low_current_fatigue");

  score -= input.repetitionPenalty;
  if (input.repetitionPenalty < NEGLIGIBLE_REPETITION_PENALTY) reasonCodes.push("no_repetition_penalty");

  const baselinePenalty = RISK_LEVEL_BASELINE_PENALTY[input.riskLevel] ?? 0;
  score -= baselinePenalty + (input.elevatedRisk ? ELEVATED_RISK_PENALTY : 0);

  return { score: Math.round(score * 100) / 100, reasonCodes };
}

function isLikedActivity(exercise: Exercise, likes: string[]): boolean {
  const name = String(exercise.metadata.name ?? "").toLowerCase();
  return likes.some((like) => name.includes(like.toLowerCase()));
}

function decayedRepetitionPenalty(lastPerformedAt: Date | undefined, now: Date): number {
  if (!lastPerformedAt) return 0;
  const daysSince = (now.getTime() - lastPerformedAt.getTime()) / 86_400_000;
  return REPETITION_PENALTY_BASE * Math.pow(0.5, daysSince / REPETITION_PENALTY_HALF_LIFE_DAYS);
}

export interface ScoredCandidate {
  exerciseId: string;
  score: number;
  reasonCodes: string[];
}

export async function scoreCandidates(
  userId: string,
  now: Date,
  likes: string[],
  limitingCapabilityIds: ReadonlySet<string>,
  eligibleExerciseIds: string[],
  pool: Queryable = getPool(),
): Promise<ScoredCandidate[]> {
  const allExercises = await getAllExercises(pool);
  const exerciseById = new Map(allExercises.map((e) => [e.exerciseId, e]));

  const capabilityPriorities = await getCapabilityPriorities(pool);

  const bucketFatigues = await getBucketFatigue(userId, now, pool);
  const bucketFatigueByKey = new Map(
    bucketFatigues.map((b) => [`${b.movementPattern}|${b.recoveryClass}`, b.bucketFatigue]),
  );

  const history = await getVariationHistory(userId, REPETITION_PENALTY_LOOKBACK_DAYS, now, pool);
  const lastPerformedByExerciseId = new Map<string, Date>();
  for (const entry of history) {
    if (!lastPerformedByExerciseId.has(entry.exerciseId)) {
      lastPerformedByExerciseId.set(entry.exerciseId, new Date(entry.completedAt));
    }
  }

  const results: ScoredCandidate[] = [];

  for (const exerciseId of eligibleExerciseIds) {
    const exercise = exerciseById.get(exerciseId);
    if (!exercise) continue;

    const regression = await getRegression(exerciseId, pool);
    const painRiskIds = regression ? [exerciseId, regression.exerciseId] : [exerciseId];
    const painRisk = await getPainRisk(userId, painRiskIds, pool);

    const bucketKey = `${exercise.movementPattern}|${exercise.recoveryClass}`;

    const { score, reasonCodes } = computeScore({
      capabilityEffects: exercise.capabilityEffects,
      capabilityPriorities,
      limitingCapabilityIds,
      isLikedActivity: isLikedActivity(exercise, likes),
      fatigueCost: exercise.fatigueCost,
      currentBucketFatigue: bucketFatigueByKey.get(bucketKey) ?? 0,
      repetitionPenalty: decayedRepetitionPenalty(lastPerformedByExerciseId.get(exerciseId), now),
      riskLevel: exercise.riskLevel as "low" | "moderate" | "high",
      elevatedRisk: painRisk.elevatedRisk,
    });

    results.push({ exerciseId, score, reasonCodes });
  }

  return results.sort((a, b) => b.score - a.score);
}
