import { test } from "node:test";
import assert from "node:assert/strict";
import { applyVariationRules } from "./applyVariationRules.js";
import { getExercise } from "../derivations/variation.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertExerciseResultEvent, insertReadinessEntry } from "../testing/fixtures.js";

const NOW = new Date("2026-07-10T12:00:00Z");
const TODAY = "2026-07-10";

// spanish_squat: squat/moderate, generalWarmthRequired 12, movementPatternWarmthRequired
// 18, warmthEffect 14, regression is wall_sit (warmthEffect 12).

test("uses the regression when the candidate is flagged elevatedRisk and a regression exists", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, {
      exerciseId: "spanish_squat",
      completedAt: new Date(NOW.getTime() - 3_600_000),
      prescribed: { painLimit: 3 },
      actual: { maxPain: 5 },
      cleanCompletion: false,
    });
    const candidate = (await getExercise("spanish_squat", db))!;

    const selection = await applyVariationRules("user-test-fixture", "UTC", NOW, candidate, db);

    assert.equal(selection.exerciseId, "wall_sit");
    assert.equal(selection.reason, "elevated_risk_use_regression");
  });
});

test("uses the regression on a yellow readiness day", async () => {
  await withTransaction(async (db) => {
    await insertReadinessEntry(db, { date: TODAY, painNow: 2, computedStatus: "yellow" });
    const candidate = (await getExercise("spanish_squat", db))!;

    const selection = await applyVariationRules("user-test-fixture", "UTC", NOW, candidate, db);

    assert.equal(selection.exerciseId, "wall_sit");
    assert.equal(selection.reason, "low_readiness_use_regression");
  });
});

test("uses the regression when warmth is only barely above its required threshold", async () => {
  await withTransaction(async (db) => {
    // Squat-pattern warmth lands at ~19.7: above the hard requirement (18) but below
    // the 1.25x margin (22.5) this step uses for "barely enough."
    const eightMinutesAgo = new Date(NOW.getTime() - 8 * 60_000);
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: eightMinutesAgo });
    await insertExerciseResultEvent(db, { exerciseId: "spanish_squat", completedAt: eightMinutesAgo });
    const candidate = (await getExercise("spanish_squat", db))!;

    const selection = await applyVariationRules("user-test-fixture", "UTC", NOW, candidate, db);

    assert.equal(selection.exerciseId, "wall_sit");
    assert.equal(selection.reason, "low_warmth_use_regression");
  });
});

test("keeps the candidate when nothing warrants variation", async () => {
  await withTransaction(async (db) => {
    // Same pair of events, much more recent -- comfortably clears both the hard
    // threshold and the margin.
    const oneMinuteAgo = new Date(NOW.getTime() - 60_000);
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: oneMinuteAgo });
    await insertExerciseResultEvent(db, { exerciseId: "spanish_squat", completedAt: oneMinuteAgo });
    const candidate = (await getExercise("spanish_squat", db))!;

    const selection = await applyVariationRules("user-test-fixture", "UTC", NOW, candidate, db);

    assert.equal(selection.exerciseId, "spanish_squat");
    assert.equal(selection.reason, "no_variation_needed");
  });
});

test("uses the progression when the exercise's most recent result was easy and low-pain", async () => {
  await withTransaction(async (db) => {
    const oneMinuteAgo = new Date(NOW.getTime() - 60_000);
    // Supporting warmth so wall_sit's own thresholds are comfortably cleared --
    // isolates the progression-justification rule from the warmth-margin rule.
    await insertExerciseResultEvent(db, { exerciseId: "spanish_squat", completedAt: oneMinuteAgo });
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      completedAt: oneMinuteAgo,
      actual: { difficulty: "easy", maxPain: 0 },
    });
    const candidate = (await getExercise("wall_sit", db))!;

    const selection = await applyVariationRules("user-test-fixture", "UTC", NOW, candidate, db);

    assert.equal(selection.exerciseId, "spanish_squat");
    assert.equal(selection.reason, "recent_results_justify_progression");
  });
});
