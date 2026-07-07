/**
 * Get Next Action (docs/spec/05-server-api.md#get-next-action,
 * docs/spec/06-decision-pipeline.md): the full "next" pipeline in the documented
 * order -- Safety Veto, Identify Limiting Capabilities, Generate Candidate Actions,
 * Score Candidate Actions, Apply Variation Rules, Select Dose, Build Explanation --
 * plus the recommendationId pinning behavior (docs/spec/13-data-layer.md's one
 * deliberate exception to derive-don't-store).
 *
 * The user profile is passed in rather than fetched here, same reasoning as
 * candidateGeneration.ts: it's raw state the Load State step already loaded.
 */

import { randomUUID } from "node:crypto";
import { getPool, type Queryable } from "../db.js";
import { checkSafetyVeto } from "./safetyVeto.js";
import { identifyLimitingCapabilities } from "./limitingCapabilities.js";
import { generateCandidates, type CandidateProfile } from "./candidateGeneration.js";
import { scoreCandidates } from "./candidateScoring.js";
import { applyVariationRules } from "./applyVariationRules.js";
import { selectDose, type DoseSelection } from "./selectDose.js";
import { buildExerciseExplanation, buildRestExplanation } from "./explanation.js";
import { hasEnoughStimulusToday } from "./dailyStimulus.js";
import { getPendingRecommendation, setPendingRecommendation } from "../derivations/pendingRecommendation.js";
import { getDailyProgress } from "../derivations/recovery.js";
import { getWarmth } from "../derivations/fatigueWarmth.js";
import { getTodayReadiness } from "../derivations/readiness.js";
import { getExercise, type Exercise } from "../derivations/variation.js";

const DAILY_STIMULUS_TARGET = 70;
// "No remaining candidate offers meaningful benefit" (docs/spec/06-decision-pipeline.md
// #determine-whether-enough-has-been-done-today) has no concrete number in the spec;
// a non-positive top score is used here since fatigue/risk/repetition costs are
// already netted into the score itself, so <=0 means costs already outweigh benefit.
const MEANINGFUL_BENEFIT_THRESHOLD = 0;

export interface UserProfileForNext {
  availableEquipment: string[];
  movementPatternRestrictions: Record<string, "mild" | "avoid">;
  likes: string[];
}

export interface NextActionResult {
  nextAction: Record<string, unknown>;
  todayProgress: {
    status: "in_progress" | "complete";
    stimulusScore: number;
    targetStimulusScore: number;
    percentComplete: number;
  };
  stateSummary: {
    readiness: "green" | "yellow" | "red" | "unknown";
    warmth: "cold" | "slightly_warm" | "warm" | "very_warm";
    limitingCapabilities: string[];
  };
}

function warmthLabel(general: number): NextActionResult["stateSummary"]["warmth"] {
  if (general >= 70) return "very_warm";
  if (general >= 40) return "warm";
  if (general >= 20) return "slightly_warm";
  return "cold";
}

function estimatedDurationSecFor(prescription: DoseSelection["next"]): number | null {
  if (!prescription || typeof prescription.durationSec !== "number" || typeof prescription.sets !== "number") {
    return null;
  }
  const restSec = prescription.restSec ?? 0;
  return prescription.sets * prescription.durationSec + Math.max(0, prescription.sets - 1) * restSec;
}

function buildRestAction(recommendationId: string, reasonCodes: string[]): Record<string, unknown> {
  const explanation = buildRestExplanation(reasonCodes);
  return {
    type: "rest",
    recommendationId,
    title: explanation.title,
    estimatedDurationSec: null,
    instructions: explanation.instructions,
    completionQuestions: explanation.completionQuestions,
    why: explanation.why,
  };
}

function buildExerciseAction(
  recommendationId: string,
  exercise: Exercise,
  dose: DoseSelection,
  reasonCodes: string[],
): Record<string, unknown> {
  const explanation = buildExerciseExplanation(exercise, reasonCodes);
  return {
    type: "exercise",
    recommendationId,
    exerciseId: exercise.exerciseId,
    title: explanation.title,
    icon: explanation.icon,
    prescription: dose.next ?? null,
    estimatedDurationSec: estimatedDurationSecFor(dose.next),
    instructions: explanation.instructions,
    completionQuestions: explanation.completionQuestions,
    why: explanation.why,
  };
}

async function computeNextAction(
  userId: string,
  timezone: string,
  now: Date,
  profile: UserProfileForNext,
  limitingCapabilityIds: ReadonlySet<string>,
  pool: Queryable,
): Promise<Record<string, unknown>> {
  const recommendationId = randomUUID();

  const veto = await checkSafetyVeto(userId, timezone, now, pool);
  if (veto.vetoed) {
    return buildRestAction(recommendationId, veto.reasonCodes);
  }

  const candidateProfile: CandidateProfile = {
    availableEquipment: profile.availableEquipment,
    movementPatternRestrictions: profile.movementPatternRestrictions,
  };
  const eligibility = await generateCandidates(userId, timezone, now, candidateProfile, pool);
  const eligibleIds = eligibility.filter((e) => e.eligible).map((e) => e.exerciseId);

  if (eligibleIds.length === 0) {
    return buildRestAction(recommendationId, ["no_eligible_candidates"]);
  }

  const scored = await scoreCandidates(userId, now, profile.likes, limitingCapabilityIds, eligibleIds, pool);
  const top = scored[0]!;

  const enoughToday = await hasEnoughStimulusToday(userId, timezone, now, pool);
  if (enoughToday && top.score <= MEANINGFUL_BENEFIT_THRESHOLD) {
    return buildRestAction(recommendationId, ["enough_stimulus_today"]);
  }

  const topExercise = (await getExercise(top.exerciseId, pool))!;
  const variation = await applyVariationRules(userId, timezone, now, topExercise, pool);
  const finalExercise =
    variation.exerciseId === topExercise.exerciseId ? topExercise : (await getExercise(variation.exerciseId, pool))!;

  const dose = await selectDose(userId, finalExercise.exerciseId, pool);

  // "no_variation_needed" just means the top-scored candidate was kept as-is -- not
  // itself a reason worth surfacing to the user.
  const variationReasonCodes = variation.reason === "no_variation_needed" ? [] : [variation.reason];

  return buildExerciseAction(recommendationId, finalExercise, dose, [...top.reasonCodes, ...variationReasonCodes]);
}

export async function getNextAction(
  userId: string,
  timezone: string,
  now: Date,
  profile: UserProfileForNext,
  pool: Queryable = getPool(),
): Promise<NextActionResult> {
  const dailyProgress = await getDailyProgress(userId, timezone, now, pool);
  const warmth = await getWarmth(userId, now, pool);
  const readiness = await getTodayReadiness(userId, timezone, now, pool);
  const limiting = await identifyLimitingCapabilities(userId, now, pool);

  const todayProgress: NextActionResult["todayProgress"] = {
    status: dailyProgress.currentStimulusScore >= DAILY_STIMULUS_TARGET ? "complete" : "in_progress",
    stimulusScore: dailyProgress.currentStimulusScore,
    targetStimulusScore: DAILY_STIMULUS_TARGET,
    percentComplete: Math.min(100, Math.round((dailyProgress.currentStimulusScore / DAILY_STIMULUS_TARGET) * 100)),
  };

  const stateSummary: NextActionResult["stateSummary"] = {
    readiness: readiness?.computedStatus ?? "unknown",
    warmth: warmthLabel(warmth.general),
    limitingCapabilities: [...limiting.limitingCapabilityIds],
  };

  const pending = await getPendingRecommendation(userId, now, pool);
  if (pending) {
    return { nextAction: pending.nextAction, todayProgress, stateSummary };
  }

  const nextAction = await computeNextAction(
    userId,
    timezone,
    now,
    profile,
    limiting.limitingCapabilityIds,
    pool,
  );
  await setPendingRecommendation(userId, nextAction.recommendationId as string, nextAction, now, pool);

  return { nextAction, todayProgress, stateSummary };
}
