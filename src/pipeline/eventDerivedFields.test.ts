import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDoseRatio, computeCleanCompletion } from "./eventDerivedFields.js";

test("dose ratio falls back to 1.0 with no prescription to compare against", () => {
  assert.equal(computeDoseRatio(null, { durationSecCompleted: 15 }), 1.0);
});

test("dose ratio compares duration when the prescription is duration-based", () => {
  assert.equal(computeDoseRatio({ durationSec: 30 }, { durationSecCompleted: 15 }), 0.5);
});

test("dose ratio compares reps when the prescription is rep-based", () => {
  assert.equal(computeDoseRatio({ reps: 10 }, { reps: 8 }), 0.8);
});

test("dose ratio falls back to sets when neither duration nor reps are present", () => {
  assert.equal(computeDoseRatio({ sets: 4 }, { setsCompleted: 2 }), 0.5);
});

test("dose ratio is capped at 1.0 when actual exceeds prescribed", () => {
  assert.equal(computeDoseRatio({ durationSec: 30 }, { durationSecCompleted: 45 }), 1.0);
});

test("dose ratio floors at 0 rather than going negative", () => {
  assert.equal(computeDoseRatio({ durationSec: 30 }, { durationSecCompleted: -5 }), 0);
});

test("clean completion is true with no prescription and ordinary actuals", () => {
  assert.equal(computeCleanCompletion(null, { maxPain: 1, rpe: 5 }), true);
});

test("clean completion is false when pain exceeded the prescribed limit", () => {
  assert.equal(computeCleanCompletion({ painLimit: 3 }, { maxPain: 4 }), false);
});

test("clean completion is false when difficulty was too_hard, even with no prescription", () => {
  assert.equal(computeCleanCompletion(null, { difficulty: "too_hard" }), false);
});

test("clean completion is false when rpe reached targetRpe + 3", () => {
  assert.equal(computeCleanCompletion({ targetRpe: 5 }, { rpe: 8 }), false);
  assert.equal(computeCleanCompletion({ targetRpe: 5 }, { rpe: 7 }), true);
});
