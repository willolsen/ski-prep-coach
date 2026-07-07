import { test } from "node:test";
import assert from "node:assert/strict";
import { logEntries } from "./logWithoutRecommendation.js";
import { withTransaction } from "../testing/withTransaction.js";

test("stores one exercise_result event per entry with no recommendationId or prescribed block", async () => {
  await withTransaction(async (db) => {
    const eventIds = await logEntries(
      "user-001",
      [
        {
          exerciseId: "bodyweight_squat",
          source: "onboarding",
          timezone: "America/Los_Angeles",
          occurredAt: "2026-06-20T09:00:00-07:00",
          actual: { setsCompleted: 3, reps: 10, maxPain: 1, rpe: 5 },
        },
        {
          exerciseId: "steady_state_rollerblading",
          source: "self_directed",
          timezone: "America/Los_Angeles",
          occurredAt: "2026-07-05T18:30:00-07:00",
          actual: { durationSecCompleted: 1500, maxPain: 0, rpe: 4, notes: "Beautiful evening." },
        },
      ],
      db,
    );

    assert.equal(eventIds.length, 2);

    const { rows } = await db.query<{
      source: string;
      type: string;
      recommendation_id: string | null;
      prescribed: unknown;
      dose_ratio: number;
      clean_completion: boolean;
    }>(`SELECT source, type, recommendation_id, prescribed, dose_ratio, clean_completion FROM events WHERE user_id = 'user-001' ORDER BY completed_at`);

    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.source, "onboarding");
    assert.equal(rows[1]!.source, "self_directed");
    for (const row of rows) {
      assert.equal(row.type, "exercise_result");
      assert.equal(row.recommendation_id, null);
      assert.equal(row.prescribed, null);
      assert.equal(row.dose_ratio, 1);
      assert.equal(row.clean_completion, true);
    }
  });
});

test("an empty entries list stores nothing and returns an empty array", async () => {
  await withTransaction(async (db) => {
    const eventIds = await logEntries("user-001", [], db);
    assert.deepEqual(eventIds, []);
  });
});
