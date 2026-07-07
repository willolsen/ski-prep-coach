import { test } from "node:test";
import assert from "node:assert/strict";
import { identifyLimitingCapabilities } from "./limitingCapabilities.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertExerciseResultEvent } from "../testing/fixtures.js";

// Cold-start limitingRank = target * (priority/10):
// knee_capacity 75*1.0=75 (highest, unambiguous #1)
// lower_body_strength 70*0.9=63, balance 70*0.9=63 (tied)
// posterior_chain 65*0.8=52, stamina 65*0.8=52 (tied)
// mobility 60*0.7=42, aerobic_endurance 60*0.7=42 (tied)
// reaction 55*0.6=33, fall_resilience 55*0.6=33 (tied)
// upper_body_strength 50*0.5=25 (lowest, unambiguous last)

test("on a cold start, the highest target*priority capability ranks first and the lowest ranks last", async () => {
  await withTransaction(async (db) => {
    const result = await identifyLimitingCapabilities("user-001", new Date(), db);

    assert.equal(result.ranked[0]!.capabilityId, "knee_capacity");
    assert.equal(result.ranked[result.ranked.length - 1]!.capabilityId, "upper_body_strength");
    assert.equal(result.ranked.length, 10);
  });
});

test("exactly 3 capabilities are flagged as limiting", async () => {
  await withTransaction(async (db) => {
    const result = await identifyLimitingCapabilities("user-001", new Date(), db);

    assert.equal(result.limitingCapabilityIds.size, 3);
    assert.ok(result.limitingCapabilityIds.has("knee_capacity"));
  });
});

test("the undertrained boost can push a capability above one that would otherwise outrank it", async () => {
  await withTransaction(async (db) => {
    const now = new Date();
    // An unclean event still touches lastTrainedAt (docs/spec/07-result-processing.md
    // notes lastTrainedAt isn't gated by clean_completion) without changing the score --
    // this isolates the recency boost from any score-based rank change.
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      completedAt: new Date(now.getTime() - 3_600_000),
      cleanCompletion: false,
      actual: { maxPain: 5, difficulty: "too_hard" },
    });

    const result = await identifyLimitingCapabilities("user-001", now, db);

    // knee_capacity (raw 75) was just touched, so it isn't boosted; balance (raw 63,
    // untouched) gets the undertrained boost and should now outrank it: 63 * 1.2 = 75.6 > 75.
    assert.equal(result.ranked[0]!.capabilityId, "balance");
  });
});
