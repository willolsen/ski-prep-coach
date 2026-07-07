import { test } from "node:test";
import assert from "node:assert/strict";
import { getWeightedStimulusScore, hasEnoughStimulusToday, DAILY_STIMULUS_TARGET } from "./dailyStimulus.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertExerciseResultEvent } from "../testing/fixtures.js";

const NOW = new Date("2026-07-10T12:00:00Z");

test("weighted stimulus score is zero with no events today", async () => {
  await withTransaction(async (db) => {
    const score = await getWeightedStimulusScore("user-001", "UTC", NOW, db);
    assert.equal(score, 0);
  });
});

test("weighted stimulus score weights each capability's raw stimulus by its own priority/10", async () => {
  await withTransaction(async (db) => {
    // wall_sit: knee_capacity 7 (priority 10), lower_body_strength 2 (priority 9).
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: NOW });

    const score = await getWeightedStimulusScore("user-001", "UTC", NOW, db);

    // 7*(10/10) + 2*(9/10) = 7 + 1.8 = 8.8
    assert.equal(score, 8.8);
  });
});

test("hasEnoughStimulusToday is false below target and true at/above it", async () => {
  await withTransaction(async (db) => {
    const before = await hasEnoughStimulusToday("user-001", "UTC", NOW, db);
    assert.equal(before, false);

    // dose_ratio inflated to deterministically cross the fixed target of 70 in one event.
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: NOW, doseRatio: 20 });

    const after = await hasEnoughStimulusToday("user-001", "UTC", NOW, db);
    assert.equal(after, true);
    assert.equal(DAILY_STIMULUS_TARGET, 70);
  });
});
