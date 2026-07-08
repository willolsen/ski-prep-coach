import { test } from "node:test";
import assert from "node:assert/strict";
import { selectDose } from "./selectDose.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertExerciseResultEvent } from "../testing/fixtures.js";

test("with no prior history, synthesizes a conservative default prescription from a static-force exercise", async () => {
  await withTransaction(async (db) => {
    const dose = await selectDose("user-test-fixture", "wall_sit", db);

    assert.equal(dose.doseReason, "no_prior_history_using_default_prescription");
    assert.deepEqual(dose.next, { sets: 3, durationSec: 30, restSec: 45, targetRpe: 5, painLimit: 3 });
  });
});

test("with no prior history, synthesizes a duration-based default prescription for a cardio exercise", async () => {
  await withTransaction(async (db) => {
    const dose = await selectDose("user-test-fixture", "zone2_trail_hiking", db);

    assert.equal(dose.doseReason, "no_prior_history_using_default_prescription");
    assert.deepEqual(dose.next, { sets: 1, durationSec: 900, restSec: 0, targetRpe: 5, painLimit: 3 });
  });
});

test("with no prior history, synthesizes a reps-based default prescription for a non-static, non-cardio exercise", async () => {
  await withTransaction(async (db) => {
    const dose = await selectDose("user-test-fixture", "bodyweight_squat", db);

    assert.equal(dose.doseReason, "no_prior_history_using_default_prescription");
    assert.deepEqual(dose.next, { sets: 3, reps: 10, restSec: 45, targetRpe: 5, painLimit: 3 });
  });
});

test("reduces duration when pain exceeded the prescribed limit", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      completedAt: new Date(),
      prescribed: { sets: 3, durationSec: 20, painLimit: 3, targetRpe: 5 },
      actual: { maxPain: 5, rpe: 6, difficulty: "hard" },
    });

    const dose = await selectDose("user-test-fixture", "wall_sit", db);

    assert.equal(dose.doseReason, "reduce_dose_pain_or_difficulty");
    assert.equal(dose.next?.durationSec, 17);
  });
});

test("reduces duration when difficulty was too_hard even without exceeding painLimit", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      completedAt: new Date(),
      prescribed: { sets: 3, durationSec: 20, painLimit: 5, targetRpe: 5 },
      actual: { maxPain: 2, rpe: 8, difficulty: "too_hard" },
    });

    const dose = await selectDose("user-test-fixture", "wall_sit", db);

    assert.equal(dose.doseReason, "reduce_dose_pain_or_difficulty");
    assert.equal(dose.next?.durationSec, 17);
  });
});

test("increases duration slightly when too_easy with a comfortable rpe margin", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      completedAt: new Date(),
      prescribed: { sets: 3, durationSec: 20, painLimit: 3, targetRpe: 6 },
      actual: { maxPain: 0, rpe: 3, difficulty: "too_easy" },
    });

    const dose = await selectDose("user-test-fixture", "wall_sit", db);

    assert.equal(dose.doseReason, "increase_dose_slightly");
    assert.equal(dose.next?.durationSec, 23);
  });
});

test("maintains dose when neither pain/difficulty nor an easy margin apply", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      completedAt: new Date(),
      prescribed: { sets: 3, durationSec: 20, painLimit: 3, targetRpe: 5 },
      actual: { maxPain: 1, rpe: 5, difficulty: "normal" },
    });

    const dose = await selectDose("user-test-fixture", "wall_sit", db);

    assert.equal(dose.doseReason, "maintain_dose");
    assert.equal(dose.next?.durationSec, 20);
  });
});

test("adjusts reps instead of duration for a rep-based prescription", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, {
      exerciseId: "bodyweight_squat",
      completedAt: new Date(),
      prescribed: { sets: 2, reps: 20, painLimit: 3, targetRpe: 5 },
      actual: { maxPain: 5, rpe: 7, difficulty: "hard" },
    });

    const dose = await selectDose("user-test-fixture", "bodyweight_squat", db);

    assert.equal(dose.doseReason, "reduce_dose_pain_or_difficulty");
    assert.equal(dose.next?.reps, 17);
  });
});
