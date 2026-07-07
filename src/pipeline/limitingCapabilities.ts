/**
 * Identify Limiting Capabilities (docs/spec/06-decision-pipeline.md#identify-limiting-capabilities):
 * ranks capabilities by how far below target they are, weighted by priority, and flags
 * the top few as "limiting" -- these receive the scoring boost in Score Candidate
 * Actions. Runs before Generate Candidate Actions in the documented pipeline order,
 * so its result is meant to be computed once and passed into later steps, not
 * recomputed per candidate.
 *
 * Two constants the spec names without pinning down a number, chosen here and
 * documented as tunable once there's real usage data (same spirit as the readiness/
 * fatigue thresholds elsewhere in the spec):
 *   - exactly how many capabilities count as "limiting" (spec says "typically top 2-3")
 *   - how much the undertrained boost multiplies limitingRank by
 */

import { getPool, type Queryable } from "../db.js";
import { getCapabilityScores, getCapabilityTargets, getCapabilityPriorities } from "../derivations/capabilityScore.js";

const LIMITING_CAPABILITY_COUNT = 3;
const UNDERTRAINED_BOOST_MULTIPLIER = 1.2;
const UNDERTRAINED_THRESHOLD_DAYS = 3;

export interface RankedCapability {
  capabilityId: string;
  limitingRank: number;
  undertrained: boolean;
}

export interface LimitingCapabilitiesResult {
  ranked: RankedCapability[]; // sorted descending by limitingRank
  limitingCapabilityIds: Set<string>;
}

export async function identifyLimitingCapabilities(
  userId: string,
  now: Date,
  pool: Queryable = getPool(),
): Promise<LimitingCapabilitiesResult> {
  const scores = await getCapabilityScores(userId, pool);
  const targets = await getCapabilityTargets(pool);
  const priorities = await getCapabilityPriorities(pool);

  const ranked: RankedCapability[] = Object.keys(targets).map((capabilityId) => {
    const score = scores[capabilityId]?.score ?? 0;
    const target = targets[capabilityId]!;
    const priority = priorities[capabilityId] ?? 0;

    const lastTrainedAt = scores[capabilityId]?.lastTrainedAt;
    const daysSinceTrained = lastTrainedAt
      ? (now.getTime() - new Date(lastTrainedAt).getTime()) / 86_400_000
      : Infinity;
    const undertrained = daysSinceTrained > UNDERTRAINED_THRESHOLD_DAYS;

    let limitingRank = (target - score) * (priority / 10);
    if (undertrained) limitingRank *= UNDERTRAINED_BOOST_MULTIPLIER;

    return { capabilityId, limitingRank, undertrained };
  });

  ranked.sort((a, b) => b.limitingRank - a.limitingRank);

  const limitingCapabilityIds = new Set(ranked.slice(0, LIMITING_CAPABILITY_COUNT).map((r) => r.capabilityId));

  return { ranked, limitingCapabilityIds };
}
