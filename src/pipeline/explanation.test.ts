import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExerciseExplanation, buildRestExplanation } from "./explanation.js";
import type { Exercise } from "../derivations/variation.js";

const WALL_SIT: Exercise = {
  exerciseId: "wall_sit",
  baseSource: "custom",
  movementPattern: "squat",
  familyId: "squat_isometric_iso",
  progressionLevel: 1,
  recoveryClass: "moderate",
  riskLevel: "low",
  generalWarmthRequired: 10,
  movementPatternWarmthRequired: 15,
  fatigueCost: 12,
  warmthEffect: 12,
  capabilityEffects: { knee_capacity: 7, lower_body_strength: 2 },
  metadata: {
    name: "Wall Sit",
    icon: "🦵",
    instructions: ["Slide down the wall.", "Hold."],
  },
};

test("exercise explanation uses the exercise's own name, icon, and instructions", () => {
  const explanation = buildExerciseExplanation(WALL_SIT, []);

  assert.equal(explanation.title, "Wall Sit");
  assert.equal(explanation.icon, "🦵");
  assert.deepEqual(explanation.instructions, ["Slide down the wall.", "Hold."]);
  assert.equal(explanation.completionQuestions.length, 4);
});

test("exercise explanation translates reason codes into why[] messages, deduplicated", () => {
  const explanation = buildExerciseExplanation(WALL_SIT, [
    "trains_limiting_capability",
    "trains_limiting_capability",
    "low_current_fatigue",
  ]);

  assert.equal(explanation.why.length, 2);
  assert.ok(explanation.why.every((line) => typeof line === "string" && line.length > 0));
});

test("unrecognized reason codes fall back to the raw code rather than being dropped", () => {
  const explanation = buildExerciseExplanation(WALL_SIT, ["some_future_reason_code"]);
  assert.deepEqual(explanation.why, ["some_future_reason_code"]);
});

test("rest explanation matches the spec's fixed instruction template", () => {
  const explanation = buildRestExplanation(["enough_stimulus_today"]);

  assert.equal(explanation.title, "Rest Is the Best Next Action");
  assert.deepEqual(explanation.completionQuestions, []);
  assert.deepEqual(explanation.instructions, [
    "No more training is recommended right now.",
    "Normal walking and daily activity are fine.",
    "Resume when the app recommends another action.",
  ]);
  assert.equal(explanation.why.length, 1);
});
