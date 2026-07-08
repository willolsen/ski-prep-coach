import { test } from "node:test";
import assert from "node:assert/strict";
import { getRecentExerciseHistory } from "./history.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertExerciseResultEvent } from "../testing/fixtures.js";

test("returns an empty array when the user has no history", async () => {
  await withTransaction(async (db) => {
    const history = await getRecentExerciseHistory("user-test-fixture", 50, db);
    assert.deepEqual(history, []);
  });
});

test("returns events most-recent-first", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: "2026-07-01T10:00:00Z" });
    await insertExerciseResultEvent(db, { exerciseId: "spanish_squat", completedAt: "2026-07-03T10:00:00Z" });

    const history = await getRecentExerciseHistory("user-test-fixture", 50, db);

    assert.deepEqual(
      history.map((h) => h.exerciseId),
      ["spanish_squat", "wall_sit"],
    );
  });
});

test("excludes rest events", async () => {
  await withTransaction(async (db) => {
    await db.query(
      `INSERT INTO events (user_id, type, source, timezone, started_at, completed_at, actual, dose_ratio, clean_completion)
       VALUES ('user-test-fixture', 'rest', 'live', 'UTC', now(), now(), '{}', 1, true)`,
    );
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: new Date() });

    const history = await getRecentExerciseHistory("user-test-fixture", 50, db);

    assert.equal(history.length, 1);
    assert.equal(history[0]!.exerciseId, "wall_sit");
  });
});

test("respects the limit parameter", async () => {
  await withTransaction(async (db) => {
    for (let i = 0; i < 5; i++) {
      await insertExerciseResultEvent(db, {
        exerciseId: "wall_sit",
        completedAt: new Date(Date.now() - i * 3_600_000),
      });
    }

    const history = await getRecentExerciseHistory("user-test-fixture", 3, db);

    assert.equal(history.length, 3);
  });
});

test("date is derived per-event from (completedAt, that event's own timezone), not a request timezone", async () => {
  await withTransaction(async (db) => {
    // 11pm Pacific on July 1st is still July 1st in that event's own timezone,
    // even though it's already July 2nd UTC.
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      timezone: "America/Los_Angeles",
      completedAt: "2026-07-02T06:00:00Z",
    });

    const history = await getRecentExerciseHistory("user-test-fixture", 50, db);

    assert.equal(history[0]!.date, "2026-07-01");
  });
});

test("includes title and icon sourced from the exercise's metadata", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: new Date() });

    const history = await getRecentExerciseHistory("user-test-fixture", 50, db);

    assert.equal(history[0]!.title, "Wall Sit");
    assert.equal(history[0]!.icon, "\u{1F9B5}");
  });
});
