import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReadinessStatus, submitReadiness } from "./submitReadiness.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertExerciseResultEvent } from "../testing/fixtures.js";

const GREEN_INPUT = {
  painNow: 0,
  swelling: false,
  stairs: "easy" as const,
  sleepQuality: "good" as const,
  aggregateFatigue: 0,
};

test("computeReadinessStatus: green when nothing trips red or yellow", () => {
  assert.equal(computeReadinessStatus(GREEN_INPUT), "green");
});

test("computeReadinessStatus: red when swelling is reported", () => {
  assert.equal(computeReadinessStatus({ ...GREEN_INPUT, swelling: true }), "red");
});

test("computeReadinessStatus: red when stairs is difficult or unable", () => {
  assert.equal(computeReadinessStatus({ ...GREEN_INPUT, stairs: "difficult" }), "red");
  assert.equal(computeReadinessStatus({ ...GREEN_INPUT, stairs: "unable" }), "red");
});

test("computeReadinessStatus: red when painNow is 4 or higher", () => {
  assert.equal(computeReadinessStatus({ ...GREEN_INPUT, painNow: 4 }), "red");
});

test("computeReadinessStatus: yellow when painNow is 2-3", () => {
  assert.equal(computeReadinessStatus({ ...GREEN_INPUT, painNow: 2 }), "yellow");
  assert.equal(computeReadinessStatus({ ...GREEN_INPUT, painNow: 3 }), "yellow");
});

test("computeReadinessStatus: yellow when sleepQuality is poor", () => {
  assert.equal(computeReadinessStatus({ ...GREEN_INPUT, sleepQuality: "poor" }), "yellow");
});

test("computeReadinessStatus: yellow when aggregateFatigue is 60 or higher", () => {
  assert.equal(computeReadinessStatus({ ...GREEN_INPUT, aggregateFatigue: 60 }), "yellow");
});

test("submitReadiness derives date from (now, timezone) and stores computedStatus", async () => {
  await withTransaction(async (db) => {
    const result = await submitReadiness(
      "user-test-fixture",
      {
        now: "2026-07-10T07:30:00-07:00",
        timezone: "America/Los_Angeles",
        painNow: 1,
        morningStiffness: "none",
        swelling: false,
        stairs: "easy",
        sleepQuality: "good",
      },
      db,
    );

    assert.equal(result.date, "2026-07-10");
    assert.equal(result.computedStatus, "green");

    const { rows } = await db.query<{ computed_status: string; entry: { painNow: number } }>(
      `SELECT computed_status, entry FROM readiness_entries WHERE user_id = 'user-test-fixture' AND date = '2026-07-10'`,
    );
    assert.equal(rows[0]!.computed_status, "green");
    assert.equal(rows[0]!.entry.painNow, 1);
  });
});

test("submitReadiness reflects aggregateFatigue computed fresh as of the submitted now", async () => {
  await withTransaction(async (db) => {
    const now = new Date("2026-07-10T07:30:00Z");
    // romanian_deadlift: hinge/heavy_strength, fatigueCost 22, half-life 72h -- five
    // recent events push aggregateFatigue comfortably past the yellow threshold (60).
    for (let hoursAgo = 1; hoursAgo <= 5; hoursAgo++) {
      await insertExerciseResultEvent(db, {
        exerciseId: "romanian_deadlift",
        completedAt: new Date(now.getTime() - hoursAgo * 3_600_000),
      });
    }

    const result = await submitReadiness(
      "user-test-fixture",
      {
        now: now.toISOString(),
        timezone: "UTC",
        painNow: 0,
        morningStiffness: "none",
        swelling: false,
        stairs: "easy",
        sleepQuality: "good",
      },
      db,
    );

    assert.equal(result.computedStatus, "yellow");
  });
});

test("submitting again for the same derived date overwrites the previous entry", async () => {
  await withTransaction(async (db) => {
    await submitReadiness(
      "user-test-fixture",
      {
        now: "2026-07-10T07:00:00Z",
        timezone: "UTC",
        painNow: 0,
        morningStiffness: "none",
        swelling: false,
        stairs: "easy",
        sleepQuality: "good",
      },
      db,
    );

    const second = await submitReadiness(
      "user-test-fixture",
      {
        now: "2026-07-10T18:00:00Z",
        timezone: "UTC",
        painNow: 5,
        morningStiffness: "significant",
        swelling: false,
        stairs: "easy",
        sleepQuality: "good",
      },
      db,
    );

    assert.equal(second.date, "2026-07-10");
    assert.equal(second.computedStatus, "red");

    const { rows } = await db.query(`SELECT count(*) AS count FROM readiness_entries WHERE user_id = 'user-test-fixture'`);
    assert.equal(rows[0]!.count, 1);
  });
});
