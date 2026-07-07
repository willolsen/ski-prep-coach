import { test } from "node:test";
import assert from "node:assert/strict";
import { getNextAction, type UserProfileForNext } from "./getNextAction.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertReadinessEntry } from "../testing/fixtures.js";

const NOW = new Date("2026-07-10T12:00:00Z");
const TODAY = "2026-07-10";

const PERMISSIVE_PROFILE: UserProfileForNext = {
  availableEquipment: ["gym"],
  movementPatternRestrictions: {},
  likes: [],
};

test("returns a rest recommendation with a fresh recommendationId when safety-vetoed", async () => {
  await withTransaction(async (db) => {
    await insertReadinessEntry(db, { date: TODAY, painNow: 5, computedStatus: "red" });

    const result = await getNextAction("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.equal(result.nextAction.type, "rest");
    assert.ok(typeof result.nextAction.recommendationId === "string" && result.nextAction.recommendationId.length > 0);
    assert.equal(result.nextAction.estimatedDurationSec, null);
  });
});

test("returns rest when every movement pattern is restricted to avoid, since no candidate is eligible", async () => {
  await withTransaction(async (db) => {
    const profile: UserProfileForNext = {
      availableEquipment: ["gym"],
      movementPatternRestrictions: {
        squat: "avoid",
        hinge: "avoid",
        lunge: "avoid",
        push: "avoid",
        pull: "avoid",
        rotation: "avoid",
        gait_locomotion: "avoid",
      },
      likes: [],
    };

    const result = await getNextAction("user-001", "UTC", NOW, profile, db);

    assert.equal(result.nextAction.type, "rest");
  });
});

test("returns an exercise recommendation with the expected shape when nothing blocks it", async () => {
  await withTransaction(async (db) => {
    const result = await getNextAction("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.equal(result.nextAction.type, "exercise");
    assert.ok(typeof result.nextAction.exerciseId === "string");
    assert.ok(typeof result.nextAction.recommendationId === "string");
    assert.ok(Array.isArray(result.nextAction.instructions));
    assert.ok(Array.isArray(result.nextAction.completionQuestions));
    assert.ok(Array.isArray(result.nextAction.why));
  });
});

test("todayProgress and stateSummary are present alongside the recommendation", async () => {
  await withTransaction(async (db) => {
    const result = await getNextAction("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.equal(result.todayProgress.targetStimulusScore, 70);
    assert.equal(result.todayProgress.stimulusScore, 0);
    assert.equal(result.todayProgress.status, "in_progress");
    assert.equal(result.stateSummary.readiness, "unknown");
    assert.equal(result.stateSummary.warmth, "cold");
    assert.equal(result.stateSummary.limitingCapabilities.length, 3);
  });
});

test("pins the same recommendation on a second call before it's resolved", async () => {
  await withTransaction(async (db) => {
    const first = await getNextAction("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);
    const second = await getNextAction("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.equal(first.nextAction.recommendationId, second.nextAction.recommendationId);
    assert.deepEqual(first.nextAction, second.nextAction);
  });
});

test("recomputes a fresh recommendation after the 4-hour pin expires", async () => {
  await withTransaction(async (db) => {
    const first = await getNextAction("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);
    const later = new Date(NOW.getTime() + 4.1 * 3_600_000);
    const second = await getNextAction("user-001", "UTC", later, PERMISSIVE_PROFILE, db);

    assert.notEqual(first.nextAction.recommendationId, second.nextAction.recommendationId);
  });
});
