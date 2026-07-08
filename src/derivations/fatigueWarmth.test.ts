import { test } from "node:test";
import assert from "node:assert/strict";
import { getBucketFatigue, getAggregateFatigue, getWarmth } from "./fatigueWarmth.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertExerciseResultEvent } from "../testing/fixtures.js";
import { assertClose } from "../testing/assertClose.js";

// wall_sit: squat/moderate, fatigueCost 12, warmthEffect 12
// spanish_squat: squat/moderate, fatigueCost 15, warmthEffect 14
// eccentric_step_down: lunge/moderate, fatigueCost 16, warmthEffect 15
// moderate half-life: 36 hours. Warmth half-life: 20 minutes, 3-hour cutoff window.

function decay(elapsed: number, halfLife: number): number {
  return Math.pow(0.5, elapsed / halfLife);
}

test("fatigue is exactly halved after one half-life", async () => {
  await withTransaction(async (db) => {
    const now = new Date();
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      completedAt: new Date(now.getTime() - 36 * 3_600_000),
    });

    const buckets = await getBucketFatigue("user-test-fixture", now, db);

    assert.equal(buckets.length, 1);
    assertClose(buckets[0]!.bucketFatigue, 6, 1e-4);
  });
});

test("separate (movementPattern, recoveryClass) buckets don't cross-contaminate", async () => {
  await withTransaction(async (db) => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3_600_000);
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: oneHourAgo });
    await insertExerciseResultEvent(db, { exerciseId: "eccentric_step_down", completedAt: oneHourAgo });

    const buckets = await getBucketFatigue("user-test-fixture", now, db);
    const squat = buckets.find((b) => b.movementPattern === "squat");
    const lunge = buckets.find((b) => b.movementPattern === "lunge");

    assert.equal(buckets.length, 2);
    assertClose(squat!.bucketFatigue, 12 * decay(1, 36), 1e-4);
    assertClose(lunge!.bucketFatigue, 16 * decay(1, 36), 1e-4);
  });
});

test("aggregateFatigue is the max bucket, not the sum across buckets", async () => {
  await withTransaction(async (db) => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3_600_000);
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: oneHourAgo });
    await insertExerciseResultEvent(db, { exerciseId: "eccentric_step_down", completedAt: oneHourAgo });

    const aggregate = await getAggregateFatigue("user-test-fixture", now, db);

    assertClose(aggregate, 16 * decay(1, 36), 1e-4);
  });
});

test("warmth excludes events older than the 3-hour window", async () => {
  await withTransaction(async (db) => {
    const now = new Date();
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: new Date(now.getTime() - 3_600_000) });
    await insertExerciseResultEvent(db, {
      exerciseId: "spanish_squat",
      completedAt: new Date(now.getTime() - 4 * 3_600_000),
    });

    const warmth = await getWarmth("user-test-fixture", now, db);

    // Only the 1-hour-old wall_sit event should contribute.
    assertClose(warmth.general, 12 * decay(60, 20), 1e-3);
  });
});

test("warmth splits correctly across movement patterns", async () => {
  await withTransaction(async (db) => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3_600_000);
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: oneHourAgo });
    await insertExerciseResultEvent(db, { exerciseId: "eccentric_step_down", completedAt: oneHourAgo });

    const warmth = await getWarmth("user-test-fixture", now, db);
    const squatContribution = 12 * decay(60, 20);
    const lungeContribution = 15 * decay(60, 20);

    assertClose(warmth.byMovementPattern.squat, squatContribution, 1e-3);
    assertClose(warmth.byMovementPattern.lunge, lungeContribution, 1e-3);
    assert.equal(warmth.byMovementPattern.hinge, 0);
    assertClose(warmth.general, squatContribution + lungeContribution, 1e-3);
  });
});
