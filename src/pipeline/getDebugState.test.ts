import { test } from "node:test";
import assert from "node:assert/strict";
import { getDebugState, type UserProfileForNext } from "./getDebugState.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertExerciseResultEvent, insertReadinessEntry } from "../testing/fixtures.js";
import { setPendingRecommendation } from "../derivations/pendingRecommendation.js";

const NOW = new Date("2026-07-10T12:00:00Z");
const TODAY = "2026-07-10";

const PERMISSIVE_PROFILE: UserProfileForNext = {
  availableEquipment: ["gym"],
  movementPatternRestrictions: {},
  likes: [],
};

test("capabilities combine score/target/priority/limitingRank/isLimiting per capability", async () => {
  await withTransaction(async (db) => {
    const state = await getDebugState("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.equal(Object.keys(state.capabilities).length, 10);
    const kneeCapacity = state.capabilities.knee_capacity!;
    assert.equal(kneeCapacity.score, 0);
    assert.equal(kneeCapacity.target, 75);
    assert.equal(kneeCapacity.priority, 10);
    assert.equal(kneeCapacity.lastTrainedAt, null);
    assert.equal(kneeCapacity.isLimiting, true);
    assert.equal(state.limitingCapabilityIds.length, 3);
    assert.ok(state.limitingCapabilityIds.includes("knee_capacity"));
  });
});

test("fatigue reports per-bucket values and the aggregate max", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: new Date(NOW.getTime() - 3_600_000) });

    const state = await getDebugState("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.equal(state.fatigue.byBucket.length, 1);
    assert.equal(state.fatigue.byBucket[0]!.movementPattern, "squat");
    assert.equal(state.fatigue.aggregateFatigue, state.fatigue.byBucket[0]!.bucketFatigue);
  });
});

test("warmth includes the general/pattern numbers and the display label", async () => {
  await withTransaction(async (db) => {
    const state = await getDebugState("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.equal(state.warmth.general, 0);
    assert.equal(state.warmth.label, "cold");
    assert.equal(state.warmth.byMovementPattern.squat, 0);
  });
});

test("readiness reflects today's entry, or 'unknown' with no entry submitted", async () => {
  await withTransaction(async (db) => {
    const withoutEntry = await getDebugState("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);
    assert.equal(withoutEntry.readiness.computedStatus, "unknown");
    assert.equal(withoutEntry.readiness.entry, null);

    await insertReadinessEntry(db, { date: TODAY, painNow: 1, computedStatus: "green" });
    const withEntry = await getDebugState("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);
    assert.equal(withEntry.readiness.computedStatus, "green");
    assert.equal(withEntry.readiness.entry?.painNow, 1);
  });
});

test("dailyProgress reports both the raw and priority-weighted stimulus scores", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: NOW });

    const state = await getDebugState("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    // wall_sit: knee_capacity 7 (priority 10), lower_body_strength 2 (priority 9)
    assert.equal(state.dailyProgress.currentStimulusScore, 9);
    assert.equal(state.dailyProgress.weightedStimulusScore, 8.8);
    assert.equal(state.dailyProgress.targetStimulusScore, 70);
    assert.equal(state.dailyProgress.enoughStimulusToday, false);
  });
});

test("safetyVeto reflects the current veto status", async () => {
  await withTransaction(async (db) => {
    await insertReadinessEntry(db, { date: TODAY, painNow: 5, computedStatus: "red" });

    const state = await getDebugState("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.equal(state.safetyVeto.vetoed, true);
    assert.ok(state.safetyVeto.reasonCodes.length > 0);
  });
});

test("candidates cover the whole library with eligibility and score reason codes", async () => {
  await withTransaction(async (db) => {
    const state = await getDebugState("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.equal(state.candidates.length, 50);
    const coldStartExercise = state.candidates.find((c) => c.exerciseId === "ninety_ninety_hip_switch")!;
    assert.equal(coldStartExercise.eligible, true);
    assert.equal(coldStartExercise.eligibilityReasonCodes.length, 0);
    assert.ok(typeof coldStartExercise.score === "number");

    const wallSit = state.candidates.find((c) => c.exerciseId === "wall_sit")!;
    assert.equal(wallSit.eligible, false);
    assert.ok(wallSit.eligibilityReasonCodes.includes("not_warm_enough"));
    assert.equal(wallSit.score, null);
  });
});

test("topCandidate shows the variation/dose analysis for the highest-scored eligible candidate", async () => {
  await withTransaction(async (db) => {
    const state = await getDebugState("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.ok(state.topCandidate);
    assert.ok(typeof state.topCandidate?.exerciseId === "string");
    assert.ok(typeof state.topCandidate?.variation.exerciseId === "string");
    assert.ok(typeof state.topCandidate?.dose.doseReason === "string");
  });
});

test("topCandidate is still computed on a safety-vetoed day, for debugging transparency", async () => {
  await withTransaction(async (db) => {
    // A fatigue-based veto, not a red-readiness one: red readiness would also make
    // generateCandidates exclude every candidate via its own readiness_red check, so
    // that path can't demonstrate "still computed despite the veto." Fatigue-based
    // vetoing doesn't touch eligibility, so a genuine top candidate still exists.
    for (let hoursAgo = 1; hoursAgo <= 5; hoursAgo++) {
      await insertExerciseResultEvent(db, {
        exerciseId: "romanian_deadlift",
        completedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000),
      });
    }

    const state = await getDebugState("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.equal(state.safetyVeto.vetoed, true);
    assert.ok(state.safetyVeto.reasonCodes.includes("unsafe_fatigue_accumulation"));
    assert.ok(state.topCandidate);
  });
});

test("pendingRecommendation reflects the currently pinned recommendation, or null", async () => {
  await withTransaction(async (db) => {
    const withoutPending = await getDebugState("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);
    assert.equal(withoutPending.pendingRecommendation, null);

    await setPendingRecommendation("user-001", "11111111-1111-1111-1111-111111111111", { type: "rest" }, NOW, db);
    const withPending = await getDebugState("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);
    assert.equal(withPending.pendingRecommendation?.recommendationId, "11111111-1111-1111-1111-111111111111");
  });
});
