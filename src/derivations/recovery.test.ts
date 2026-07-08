import { test } from "node:test";
import assert from "node:assert/strict";
import { getRecoveryStatus, getPainRisk, getDailyProgress, getVariationHistory } from "./recovery.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertExerciseResultEvent } from "../testing/fixtures.js";

// wall_sit: squat/moderate (minRestHours 24, maxPerDay 2, maxPerWeek 6)
// romanian_deadlift: hinge/heavy_strength (minRestHours 48, maxPerDay 1, maxPerWeek 3)

test("recovery status with no history is eligible with zero counts", async () => {
  await withTransaction(async (db) => {
    const status = await getRecoveryStatus("user-test-fixture", "push", "light", new Date(), db);

    assert.equal(status.lastDoneAt, null);
    assert.equal(status.todayCount, 0);
    assert.equal(status.weekCount, 0);
    assert.equal(status.eligible, true);
  });
});

test("ineligible while within minRestHours of the last event", async () => {
  await withTransaction(async (db) => {
    const now = new Date();
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: new Date(now.getTime() - 3_600_000) });

    const status = await getRecoveryStatus("user-test-fixture", "squat", "moderate", now, db);

    assert.equal(status.eligible, false);
  });
});

test("ineligible once weekly count reaches maxPerWeek, even with rest and daily count satisfied", async () => {
  await withTransaction(async (db) => {
    const now = new Date();
    await insertExerciseResultEvent(db, {
      exerciseId: "romanian_deadlift",
      completedAt: new Date(now.getTime() - 130 * 3_600_000),
    });
    await insertExerciseResultEvent(db, {
      exerciseId: "romanian_deadlift",
      completedAt: new Date(now.getTime() - 80 * 3_600_000),
    });
    await insertExerciseResultEvent(db, {
      exerciseId: "romanian_deadlift",
      completedAt: new Date(now.getTime() - 60 * 3_600_000),
    });

    const status = await getRecoveryStatus("user-test-fixture", "hinge", "heavy_strength", now, db);

    assert.equal(status.todayCount, 0);
    assert.equal(status.weekCount, 3);
    assert.equal(status.eligible, false);
  });
});

test("pain risk is elevated when the most recent event's maxPain exceeds its own prescribed painLimit", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      completedAt: new Date(Date.now() - 3_600_000),
      prescribed: { painLimit: 3 },
      actual: { maxPain: 5 },
      cleanCompletion: false,
    });

    const risk = await getPainRisk("user-test-fixture", ["wall_sit"], db);

    assert.equal(risk.elevatedRisk, true);
    assert.equal(risk.mostRecentEvent?.exerciseId, "wall_sit");
  });
});

test("pain risk is false with no matching history", async () => {
  await withTransaction(async (db) => {
    const risk = await getPainRisk("user-test-fixture", ["wall_sit"], db);

    assert.equal(risk.elevatedRisk, false);
    assert.equal(risk.mostRecentEvent, null);
  });
});

test("daily progress respects the (now, timezone) calendar-day boundary", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      timezone: "UTC",
      completedAt: "2026-07-01T23:59:00Z", // yesterday relative to `now` below
    });
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      timezone: "UTC",
      completedAt: "2026-07-02T00:05:00Z", // today
    });

    const progress = await getDailyProgress("user-test-fixture", "UTC", new Date("2026-07-02T08:00:00Z"), db);

    // Only the "today" event should count -- if the boundary were off by one, this would double.
    assert.equal(progress.capabilityStimulus.knee_capacity, 7);
    assert.equal(progress.capabilityStimulus.lower_body_strength, 2);
    assert.equal(progress.currentStimulusScore, 9);
  });
});

test("variation history returns only events within the requested day window, most recent first", async () => {
  await withTransaction(async (db) => {
    const now = new Date();
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: new Date(now.getTime() - 1 * 86_400_000) });
    await insertExerciseResultEvent(db, { exerciseId: "spanish_squat", completedAt: new Date(now.getTime() - 4 * 86_400_000) });
    await insertExerciseResultEvent(db, {
      exerciseId: "eccentric_step_down",
      completedAt: new Date(now.getTime() - 10 * 86_400_000),
    });

    const history = await getVariationHistory("user-test-fixture", 5, now, db);

    assert.deepEqual(
      history.map((e) => e.exerciseId),
      ["wall_sit", "spanish_squat"],
    );
  });
});
