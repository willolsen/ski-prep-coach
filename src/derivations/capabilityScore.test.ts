import { test } from "node:test";
import assert from "node:assert/strict";
import { getCapabilityScores } from "./capabilityScore.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertExerciseResultEvent } from "../testing/fixtures.js";
import { assertClose } from "../testing/assertClose.js";

// wall_sit: capabilityEffects { knee_capacity: 7, lower_body_strength: 2 }
// targets: knee_capacity 75 (priority 10), lower_body_strength 70 (priority 9)

test("a single clean event contributes exactly the growth formula's first step", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      completedAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const scores = await getCapabilityScores("user-001", db);

    assertClose(scores.knee_capacity!.score, 0.7);
    assertClose(scores.lower_body_strength!.score, 0.2);
    assert.notEqual(scores.knee_capacity!.lastTrainedAt, null);
  });
});

test("a second event grows the score by less than the first (diminishing returns)", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: new Date(Date.now() - 2 * 3_600_000) });
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: new Date(Date.now() - 1 * 3_600_000) });

    const scores = await getCapabilityScores("user-001", db);

    assertClose(scores.knee_capacity!.score, 1.3934666666666666);
    assertClose(scores.lower_body_strength!.score, 0.39942857142857144);
  });
});

test("an event that wasn't a clean completion contributes zero to the score", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      completedAt: new Date(Date.now() - 2 * 3_600_000),
      cleanCompletion: true,
    });
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      completedAt: new Date(Date.now() - 1 * 3_600_000),
      cleanCompletion: false,
      actual: { maxPain: 5, difficulty: "too_hard" },
    });

    const scores = await getCapabilityScores("user-001", db);

    // Same as the single-clean-event case: the unclean event adds nothing.
    assertClose(scores.knee_capacity!.score, 0.7);
  });
});

test("a capability with no qualifying events has score 0 and no lastTrainedAt", async () => {
  await withTransaction(async (db) => {
    const scores = await getCapabilityScores("user-001", db);

    assert.equal(scores.reaction!.score, 0);
    assert.equal(scores.reaction!.lastTrainedAt, null);
  });
});
