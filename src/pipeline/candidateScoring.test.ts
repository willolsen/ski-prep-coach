import { test } from "node:test";
import assert from "node:assert/strict";
import { computeScore, type ScoringInput } from "./candidateScoring.js";

const BASE_INPUT: ScoringInput = {
  capabilityEffects: { knee_capacity: 7 },
  capabilityPriorities: { knee_capacity: 10 },
  limitingCapabilityIds: new Set(),
  isLikedActivity: false,
  fatigueCost: 20,
  currentBucketFatigue: 0,
  repetitionPenalty: 0,
  riskLevel: "low",
  elevatedRisk: false,
};

test("a limiting capability contributes 1.5x instead of 1x", () => {
  const without = computeScore(BASE_INPUT);
  const withLimiting = computeScore({ ...BASE_INPUT, limitingCapabilityIds: new Set(["knee_capacity"]) });

  // 7 * (10/10) * (1.5 - 1.0) = 3.5
  assert.equal(withLimiting.score - without.score, 3.5);
  assert.ok(withLimiting.reasonCodes.includes("trains_limiting_capability"));
  assert.ok(!without.reasonCodes.includes("trains_limiting_capability"));
});

test("a liked activity adds a flat +10 enjoyment bonus", () => {
  const without = computeScore(BASE_INPUT);
  const withLiked = computeScore({ ...BASE_INPUT, isLikedActivity: true });

  assert.equal(withLiked.score - without.score, 10);
  assert.ok(withLiked.reasonCodes.includes("liked_activity"));
});

test("fatigue penalty scales linearly with current bucket fatigue", () => {
  const noFatigue = computeScore(BASE_INPUT);
  const halfFatigue = computeScore({ ...BASE_INPUT, currentBucketFatigue: 50 });

  // fatigueCost 20 * (50/100) = 10
  assert.equal(noFatigue.score - halfFatigue.score, 10);
});

test("repetition penalty subtracts directly from the score", () => {
  const noPenalty = computeScore(BASE_INPUT);
  const withPenalty = computeScore({ ...BASE_INPUT, repetitionPenalty: 5 });

  assert.equal(noPenalty.score - withPenalty.score, 5);
});

test("risk penalty is the riskLevel baseline plus a flat surcharge when elevatedRisk is flagged", () => {
  const low = computeScore({ ...BASE_INPUT, riskLevel: "low" });
  const moderate = computeScore({ ...BASE_INPUT, riskLevel: "moderate" });
  const high = computeScore({ ...BASE_INPUT, riskLevel: "high" });
  const moderateElevated = computeScore({ ...BASE_INPUT, riskLevel: "moderate", elevatedRisk: true });

  assert.equal(low.score - moderate.score, 5);
  assert.equal(low.score - high.score, 15);
  assert.equal(moderate.score - moderateElevated.score, 30);
});

test("low_current_fatigue reason code only appears below the low-fatigue threshold", () => {
  const low = computeScore({ ...BASE_INPUT, currentBucketFatigue: 10 });
  const high = computeScore({ ...BASE_INPUT, currentBucketFatigue: 80 });

  assert.ok(low.reasonCodes.includes("low_current_fatigue"));
  assert.ok(!high.reasonCodes.includes("low_current_fatigue"));
});

test("no_repetition_penalty reason code only appears when the penalty is negligible", () => {
  const negligible = computeScore({ ...BASE_INPUT, repetitionPenalty: 0 });
  const meaningful = computeScore({ ...BASE_INPUT, repetitionPenalty: 12 });

  assert.ok(negligible.reasonCodes.includes("no_repetition_penalty"));
  assert.ok(!meaningful.reasonCodes.includes("no_repetition_penalty"));
});
