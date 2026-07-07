import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { submitResult } from "./submitResult.js";
import { setPendingRecommendation, getPendingRecommendation } from "../derivations/pendingRecommendation.js";
import { withTransaction } from "../testing/withTransaction.js";

const NOW = new Date("2026-07-10T09:00:00Z");

test("stores an exercise_result event and clears the pending recommendation", async () => {
  await withTransaction(async (db) => {
    const recommendationId = randomUUID();
    await setPendingRecommendation(
      "user-001",
      recommendationId,
      {
        type: "exercise",
        recommendationId,
        exerciseId: "wall_sit",
        prescription: { sets: 3, durationSec: 30, painLimit: 3, targetRpe: 5 },
      },
      NOW,
      db,
    );

    const outcome = await submitResult(
      "user-001",
      {
        recommendationId,
        exerciseId: "wall_sit",
        timezone: "America/Los_Angeles",
        startedAt: "2026-07-10T09:00:00Z",
        completedAt: "2026-07-10T09:04:00Z",
        actual: { setsCompleted: 3, durationSecCompleted: 30, maxPain: 1, rpe: 5, difficulty: "normal" },
      },
      db,
    );

    assert.equal(outcome.ok, true);
    assert.ok(outcome.ok && outcome.eventId.length > 0);

    const { rows } = await db.query<{
      type: string;
      exercise_id: string;
      dose_ratio: number;
      clean_completion: boolean;
      prescribed: unknown;
    }>(`SELECT type, exercise_id, dose_ratio, clean_completion, prescribed FROM events WHERE user_id = 'user-001'`);

    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.type, "exercise_result");
    assert.equal(rows[0]!.exercise_id, "wall_sit");
    assert.equal(rows[0]!.dose_ratio, 1);
    assert.equal(rows[0]!.clean_completion, true);
    assert.deepEqual(rows[0]!.prescribed, { sets: 3, durationSec: 30, painLimit: 3, targetRpe: 5 });

    const pending = await getPendingRecommendation("user-001", NOW, db);
    assert.equal(pending, null);
  });
});

test("stores a rest event with dose_ratio 1.0 and clean_completion true", async () => {
  await withTransaction(async (db) => {
    const recommendationId = randomUUID();
    await setPendingRecommendation(
      "user-001",
      recommendationId,
      { type: "rest", recommendationId, title: "Rest Is the Best Next Action" },
      NOW,
      db,
    );

    const outcome = await submitResult(
      "user-001",
      {
        recommendationId,
        timezone: "America/Los_Angeles",
        startedAt: "2026-07-10T09:00:00Z",
        completedAt: "2026-07-10T09:00:05Z",
        actual: { notes: "Took the afternoon off." },
      },
      db,
    );

    assert.equal(outcome.ok, true);

    const { rows } = await db.query<{ type: string; exercise_id: string | null; dose_ratio: number; clean_completion: boolean }>(
      `SELECT type, exercise_id, dose_ratio, clean_completion FROM events WHERE user_id = 'user-001'`,
    );

    assert.equal(rows[0]!.type, "rest");
    assert.equal(rows[0]!.exercise_id, null);
    assert.equal(rows[0]!.dose_ratio, 1);
    assert.equal(rows[0]!.clean_completion, true);
  });
});

test("computes a reduced dose_ratio and clean_completion false when the dose fell short and pain was high", async () => {
  await withTransaction(async (db) => {
    const recommendationId = randomUUID();
    await setPendingRecommendation(
      "user-001",
      recommendationId,
      {
        type: "exercise",
        recommendationId,
        exerciseId: "wall_sit",
        prescription: { sets: 3, durationSec: 30, painLimit: 3, targetRpe: 5 },
      },
      NOW,
      db,
    );

    const outcome = await submitResult(
      "user-001",
      {
        recommendationId,
        exerciseId: "wall_sit",
        timezone: "America/Los_Angeles",
        startedAt: "2026-07-10T09:00:00Z",
        completedAt: "2026-07-10T09:02:00Z",
        actual: { setsCompleted: 2, durationSecCompleted: 15, maxPain: 5, rpe: 8, difficulty: "too_hard" },
      },
      db,
    );

    assert.equal(outcome.ok, true);

    const { rows } = await db.query<{ dose_ratio: number; clean_completion: boolean }>(
      `SELECT dose_ratio, clean_completion FROM events WHERE user_id = 'user-001'`,
    );

    assert.equal(rows[0]!.dose_ratio, 0.5);
    assert.equal(rows[0]!.clean_completion, false);
  });
});

test("returns an error when there's no matching pending recommendation", async () => {
  await withTransaction(async (db) => {
    const outcome = await submitResult(
      "user-001",
      {
        recommendationId: randomUUID(),
        exerciseId: "wall_sit",
        timezone: "UTC",
        startedAt: "2026-07-10T09:00:00Z",
        completedAt: "2026-07-10T09:02:00Z",
        actual: { maxPain: 1 },
      },
      db,
    );

    assert.equal(outcome.ok, false);
    assert.ok(!outcome.ok && outcome.status === 409);

    const { rows } = await db.query(`SELECT 1 FROM events WHERE user_id = 'user-001'`);
    assert.equal(rows.length, 0);
  });
});

test("returns an error when recommendationId doesn't match the currently pinned one", async () => {
  await withTransaction(async (db) => {
    const pinnedId = randomUUID();
    await setPendingRecommendation(
      "user-001",
      pinnedId,
      { type: "exercise", recommendationId: pinnedId, exerciseId: "wall_sit", prescription: null },
      NOW,
      db,
    );

    const outcome = await submitResult(
      "user-001",
      {
        recommendationId: randomUUID(),
        exerciseId: "wall_sit",
        timezone: "UTC",
        startedAt: "2026-07-10T09:00:00Z",
        completedAt: "2026-07-10T09:02:00Z",
        actual: { maxPain: 1 },
      },
      db,
    );

    assert.equal(outcome.ok, false);
    assert.ok(!outcome.ok && outcome.status === 409);
  });
});
