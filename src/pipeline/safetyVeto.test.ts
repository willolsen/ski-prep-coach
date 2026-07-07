import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSafetyVeto } from "./safetyVeto.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertExerciseResultEvent, insertReadinessEntry } from "../testing/fixtures.js";

const NOW = new Date("2026-07-10T12:00:00Z");
const TODAY = "2026-07-10";

test("vetoes with pain_too_high when today's readiness entry has painNow >= 4", async () => {
  await withTransaction(async (db) => {
    await insertReadinessEntry(db, { date: TODAY, painNow: 5, computedStatus: "red" });

    const result = await checkSafetyVeto("user-001", "UTC", NOW, db);

    assert.equal(result.vetoed, true);
    assert.ok(result.reasonCodes.includes("pain_too_high"));
  });
});

test("vetoes with swelling_reported when swelling is reported", async () => {
  await withTransaction(async (db) => {
    await insertReadinessEntry(db, { date: TODAY, swelling: true, computedStatus: "red" });

    const result = await checkSafetyVeto("user-001", "UTC", NOW, db);

    assert.equal(result.vetoed, true);
    assert.ok(result.reasonCodes.includes("swelling_reported"));
  });
});

test("vetoes with limp_or_instability when stairs is difficult or unable", async () => {
  await withTransaction(async (db) => {
    await insertReadinessEntry(db, { date: TODAY, stairs: "unable", computedStatus: "red" });

    const result = await checkSafetyVeto("user-001", "UTC", NOW, db);

    assert.equal(result.vetoed, true);
    assert.ok(result.reasonCodes.includes("limp_or_instability"));
  });
});

test("vetoes with safety_red_day when the stored computedStatus is red", async () => {
  await withTransaction(async (db) => {
    await insertReadinessEntry(db, { date: TODAY, painNow: 5, computedStatus: "red" });

    const result = await checkSafetyVeto("user-001", "UTC", NOW, db);

    assert.equal(result.vetoed, true);
    assert.ok(result.reasonCodes.includes("safety_red_day"));
    // Matches the spec's own example: both codes fire together, since red is caused by the same underlying signal.
    assert.ok(result.reasonCodes.includes("pain_too_high"));
  });
});

test("vetoes with unsafe_fatigue_accumulation when aggregateFatigue reaches 100, even on a green day", async () => {
  await withTransaction(async (db) => {
    await insertReadinessEntry(db, { date: TODAY, computedStatus: "green" });
    for (let hoursAgo = 1; hoursAgo <= 5; hoursAgo++) {
      await insertExerciseResultEvent(db, {
        exerciseId: "romanian_deadlift",
        completedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000),
      });
    }

    const result = await checkSafetyVeto("user-001", "UTC", NOW, db);

    assert.equal(result.vetoed, true);
    assert.deepEqual(result.reasonCodes, ["unsafe_fatigue_accumulation"]);
  });
});

test("does not veto on a green day with low fatigue", async () => {
  await withTransaction(async (db) => {
    await insertReadinessEntry(db, { date: TODAY, computedStatus: "green" });

    const result = await checkSafetyVeto("user-001", "UTC", NOW, db);

    assert.equal(result.vetoed, false);
    assert.deepEqual(result.reasonCodes, []);
  });
});

test("does not veto when there's no readiness entry yet and fatigue is low", async () => {
  await withTransaction(async (db) => {
    const result = await checkSafetyVeto("user-001", "UTC", NOW, db);

    assert.equal(result.vetoed, false);
    assert.deepEqual(result.reasonCodes, []);
  });
});
