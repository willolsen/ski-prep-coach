/**
 * Get Debug State: not part of docs/spec/05-server-api.md's original four endpoints
 * -- added on request to expose every intermediate value the "next" pipeline
 * computes, for debugging now and eventually as the basis for a user-facing "your
 * current state" view (see docs/spec/05-server-api.md's own new section for this).
 *
 * Unlike GET /next, this always computes everything fresh and ignores the pinned
 * recommendation for its own analysis (surfacing it separately in
 * `pendingRecommendation` for comparison) -- the point is to see what the engine
 * would compute right now, not to reuse a frozen decision. It also computes
 * candidate scoring and the top candidate's variation/dose analysis regardless of
 * safety veto or "enough today" status, since those are exactly the kind of thing
 * useful to inspect when debugging *why* a rest recommendation was chosen.
 */

import { getPool, type Queryable } from "../db.js";
import {
  getCapabilityScores,
  getCapabilityTargets,
  getCapabilityPriorities,
} from "../derivations/capabilityScore.js";
import { getBucketFatigue, getWarmth, warmthLabel, type BucketFatigue, type WarmthLabel } from "../derivations/fatigueWarmth.js";
import { getTodayReadiness, type ReadinessEntry } from "../derivations/readiness.js";
import { getDailyProgress } from "../derivations/recovery.js";
import { getPendingRecommendation } from "../derivations/pendingRecommendation.js";
import { getExercise } from "../derivations/variation.js";
import { checkSafetyVeto, type SafetyVetoResult } from "./safetyVeto.js";
import { identifyLimitingCapabilities } from "./limitingCapabilities.js";
import { generateCandidates, type CandidateProfile } from "./candidateGeneration.js";
import { scoreCandidates } from "./candidateScoring.js";
import { applyVariationRules, type VariationSelection } from "./applyVariationRules.js";
import { selectDose, type DoseSelection } from "./selectDose.js";
import { computeWeightedStimulusScore, DAILY_STIMULUS_TARGET } from "./dailyStimulus.js";

export interface UserProfileForNext {
  availableEquipment: string[];
  movementPatternRestrictions: Record<string, "mild" | "avoid">;
  likes: string[];
}

export interface CapabilityDebug {
  score: number;
  target: number;
  priority: number;
  lastTrainedAt: string | null;
  limitingRank: number;
  undertrained: boolean;
  isLimiting: boolean;
}

export interface CandidateDebug {
  exerciseId: string;
  eligible: boolean;
  eligibilityReasonCodes: string[];
  score: number | null;
  scoreReasonCodes: string[] | null;
}

export interface TopCandidateDebug {
  exerciseId: string;
  score: number;
  variation: VariationSelection;
  dose: DoseSelection;
}

export interface DebugState {
  now: string;
  timezone: string;
  userId: string;
  capabilities: Record<string, CapabilityDebug>;
  limitingCapabilityIds: string[];
  fatigue: {
    byBucket: BucketFatigue[];
    aggregateFatigue: number;
  };
  warmth: {
    general: number;
    byMovementPattern: Record<string, number>;
    label: WarmthLabel;
  };
  readiness: {
    entry: ReadinessEntry | null;
    computedStatus: "green" | "yellow" | "red" | "unknown";
  };
  dailyProgress: {
    capabilityStimulus: Record<string, number>;
    currentStimulusScore: number;
    weightedStimulusScore: number;
    targetStimulusScore: number;
    enoughStimulusToday: boolean;
  };
  safetyVeto: SafetyVetoResult;
  candidates: CandidateDebug[];
  topCandidate: TopCandidateDebug | null;
  pendingRecommendation: { recommendationId: string; nextAction: Record<string, unknown> } | null;
}

export async function getDebugState(
  userId: string,
  timezone: string,
  now: Date,
  profile: UserProfileForNext,
  pool: Queryable = getPool(),
): Promise<DebugState> {
  const capabilityScores = await getCapabilityScores(userId, pool);
  const capabilityTargets = await getCapabilityTargets(pool);
  const capabilityPriorities = await getCapabilityPriorities(pool);
  const limiting = await identifyLimitingCapabilities(userId, now, pool);

  const capabilities: Record<string, CapabilityDebug> = {};
  for (const ranked of limiting.ranked) {
    const id = ranked.capabilityId;
    capabilities[id] = {
      score: capabilityScores[id]?.score ?? 0,
      target: capabilityTargets[id]!,
      priority: capabilityPriorities[id] ?? 0,
      lastTrainedAt: capabilityScores[id]?.lastTrainedAt ?? null,
      limitingRank: ranked.limitingRank,
      undertrained: ranked.undertrained,
      isLimiting: limiting.limitingCapabilityIds.has(id),
    };
  }

  const byBucket = await getBucketFatigue(userId, now, pool);
  const aggregateFatigue = byBucket.reduce((max, b) => Math.max(max, b.bucketFatigue), 0);

  const warmth = await getWarmth(userId, now, pool);
  const readiness = await getTodayReadiness(userId, timezone, now, pool);
  const dailyProgress = await getDailyProgress(userId, timezone, now, pool);
  const weightedStimulusScore = computeWeightedStimulusScore(dailyProgress.capabilityStimulus, capabilityPriorities);

  const veto = await checkSafetyVeto(userId, timezone, now, pool);

  const candidateProfile: CandidateProfile = {
    availableEquipment: profile.availableEquipment,
    movementPatternRestrictions: profile.movementPatternRestrictions,
  };
  const eligibility = await generateCandidates(userId, timezone, now, candidateProfile, pool);
  const eligibleIds = eligibility.filter((e) => e.eligible).map((e) => e.exerciseId);

  const scored = eligibleIds.length > 0
    ? await scoreCandidates(userId, now, profile.likes, limiting.limitingCapabilityIds, eligibleIds, pool)
    : [];
  const scoredById = new Map(scored.map((s) => [s.exerciseId, s]));

  const candidates: CandidateDebug[] = eligibility.map((e) => ({
    exerciseId: e.exerciseId,
    eligible: e.eligible,
    eligibilityReasonCodes: e.reasonCodes,
    score: scoredById.get(e.exerciseId)?.score ?? null,
    scoreReasonCodes: scoredById.get(e.exerciseId)?.reasonCodes ?? null,
  }));

  let topCandidate: TopCandidateDebug | null = null;
  if (scored.length > 0) {
    const top = scored[0]!;
    const topExercise = (await getExercise(top.exerciseId, pool))!;
    const variation = await applyVariationRules(userId, timezone, now, topExercise, pool);
    const dose = await selectDose(userId, variation.exerciseId, pool);
    topCandidate = { exerciseId: top.exerciseId, score: top.score, variation, dose };
  }

  const pending = await getPendingRecommendation(userId, now, pool);

  return {
    now: now.toISOString(),
    timezone,
    userId,
    capabilities,
    limitingCapabilityIds: [...limiting.limitingCapabilityIds],
    fatigue: { byBucket, aggregateFatigue },
    warmth: { general: warmth.general, byMovementPattern: warmth.byMovementPattern, label: warmthLabel(warmth.general) },
    readiness: { entry: readiness?.entry ?? null, computedStatus: readiness?.computedStatus ?? "unknown" },
    dailyProgress: {
      capabilityStimulus: dailyProgress.capabilityStimulus,
      currentStimulusScore: dailyProgress.currentStimulusScore,
      weightedStimulusScore,
      targetStimulusScore: DAILY_STIMULUS_TARGET,
      enoughStimulusToday: weightedStimulusScore >= DAILY_STIMULUS_TARGET,
    },
    safetyVeto: veto,
    candidates,
    topCandidate,
    pendingRecommendation: pending,
  };
}
