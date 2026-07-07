import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCandidates } from "./candidateScoring.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertExerciseResultEvent } from "../testing/fixtures.js";

test("scoreCandidates returns results sorted by score descending", async () => {
  await withTransaction(async (db) => {
    const results = await scoreCandidates(
      "user-001",
      new Date(),
      [],
      new Set(),
      ["wall_sit", "spanish_squat", "eccentric_step_down"],
      db,
    );

    assert.equal(results.length, 3);
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1]!.score >= results[i]!.score);
    }
  });
});

test("a recently-performed exercise scores lower than the same exercise with no history", async () => {
  await withTransaction(async (db) => {
    const now = new Date();

    const before = await scoreCandidates("user-001", now, [], new Set(), ["wall_sit"], db);
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: new Date(now.getTime() - 3_600_000) });
    const after = await scoreCandidates("user-001", now, [], new Set(), ["wall_sit"], db);

    // Recent history adds both a repetition penalty and bucket fatigue, both negative terms.
    assert.ok(after[0]!.score < before[0]!.score);
  });
});

test("liked activities score higher than the same candidate without the enjoyment bonus", async () => {
  await withTransaction(async (db) => {
    const now = new Date();

    const withoutLikes = await scoreCandidates("user-001", now, [], new Set(), ["zone2_trail_hiking"], db);
    const withLikes = await scoreCandidates("user-001", now, ["hiking"], new Set(), ["zone2_trail_hiking"], db);

    assert.equal(withLikes[0]!.score - withoutLikes[0]!.score, 10);
  });
});
