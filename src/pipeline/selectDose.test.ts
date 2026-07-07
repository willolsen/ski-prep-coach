import { test } from "node:test";
import assert from "node:assert/strict";
import { selectDose } from "./selectDose.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertExerciseResultEvent } from "../testing/fixtures.js";

test("with no prior history, flags that a default prescription is needed rather than guessing one", async () => {
  await withTransaction(async (db) => {
    const dose = await selectDose("user-001", "wall_sit", db);

    assert.equal(dose.doseReason, "no_prior_history_needs_default_prescription");
    assert.equal(dose.next, undefined);
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

    const dose = await selectDose("user-001", "wall_sit", db);

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

    const dose = await selectDose("user-001", "wall_sit", db);

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

    const dose = await selectDose("user-001", "wall_sit", db);

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

    const dose = await selectDose("user-001", "wall_sit", db);

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

    const dose = await selectDose("user-001", "bodyweight_squat", db);

    assert.equal(dose.doseReason, "reduce_dose_pain_or_difficulty");
    assert.equal(dose.next?.reps, 17);
  });
});
