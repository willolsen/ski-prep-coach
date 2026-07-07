import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCandidates, type CandidateProfile } from "./candidateGeneration.js";
import { withTransaction } from "../testing/withTransaction.js";
import { insertExerciseResultEvent, insertReadinessEntry } from "../testing/fixtures.js";

const NOW = new Date("2026-07-10T12:00:00Z");
const TODAY = "2026-07-10";

const PERMISSIVE_PROFILE: CandidateProfile = { availableEquipment: ["gym"], movementPatternRestrictions: {} };

function findResult(results: Awaited<ReturnType<typeof generateCandidates>>, exerciseId: string) {
  const result = results.find((r) => r.exerciseId === exerciseId);
  assert.ok(result, `expected a candidate result for ${exerciseId}`);
  return result;
}

test("a fully clean cold-start exercise is eligible with no reason codes", async () => {
  await withTransaction(async (db) => {
    // ninety_ninety_hip_switch: rotation/daily, body only, zero warmth requirements.
    const results = await generateCandidates("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);
    const result = findResult(results, "ninety_ninety_hip_switch");

    assert.equal(result.eligible, true);
    assert.deepEqual(result.reasonCodes, []);
  });
});

test("excludes an exercise when the user is missing its required equipment", async () => {
  await withTransaction(async (db) => {
    const profile: CandidateProfile = { availableEquipment: [], movementPatternRestrictions: {} };
    const results = await generateCandidates("user-001", "UTC", NOW, profile, db);

    // barbell_back_squat requires "barbell", which this profile doesn't have.
    assert.ok(findResult(results, "barbell_back_squat").reasonCodes.includes("missing_equipment"));
    // wall_sit is "body only" -- no equipment requirement to miss.
    assert.ok(!findResult(results, "wall_sit").reasonCodes.includes("missing_equipment"));
  });
});

test("excludes an exercise whose movementPattern is restricted to avoid", async () => {
  await withTransaction(async (db) => {
    const profile: CandidateProfile = {
      availableEquipment: ["gym"],
      movementPatternRestrictions: { squat: "avoid" },
    };
    const results = await generateCandidates("user-001", "UTC", NOW, profile, db);

    assert.ok(findResult(results, "wall_sit").reasonCodes.includes("movement_pattern_avoided"));
    assert.ok(!findResult(results, "ninety_ninety_hip_switch").reasonCodes.includes("movement_pattern_avoided"));
  });
});

test("a mild restriction excludes non-daily/light recovery classes but not daily/light ones", async () => {
  await withTransaction(async (db) => {
    const profile: CandidateProfile = {
      availableEquipment: ["gym"],
      movementPatternRestrictions: { squat: "mild" },
    };
    const results = await generateCandidates("user-001", "UTC", NOW, profile, db);

    // wall_sit is squat/moderate -- excluded under "mild".
    assert.ok(findResult(results, "wall_sit").reasonCodes.includes("movement_pattern_mild_restriction"));
    // banded_terminal_knee_extension is squat/daily -- allowed under "mild".
    assert.ok(!findResult(results, "banded_terminal_knee_extension").reasonCodes.includes("movement_pattern_mild_restriction"));
  });
});

test("excludes an exercise when warmth is insufficient", async () => {
  await withTransaction(async (db) => {
    // No warm-up events at all -- wall_sit requires generalWarmthRequired 10, movementPatternWarmthRequired 15.
    const results = await generateCandidates("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.ok(findResult(results, "wall_sit").reasonCodes.includes("not_warm_enough"));
  });
});

test("excludes an exercise when its recovery bucket is not eligible", async () => {
  await withTransaction(async (db) => {
    await insertExerciseResultEvent(db, { exerciseId: "wall_sit", completedAt: new Date(NOW.getTime() - 3_600_000) });

    const results = await generateCandidates("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    // squat/moderate minRestHours is 24; only 1 hour has passed.
    assert.ok(findResult(results, "wall_sit").reasonCodes.includes("recovery_not_eligible"));
  });
});

test("excludes an exercise once all its trained capabilities have already met target", async () => {
  await withTransaction(async (db) => {
    // dose_ratio is artificially large here to deterministically blow past both of
    // wall_sit's capabilities' targets in one event -- the real write path (not yet
    // built) caps dose_ratio at 1.0; this is a white-box test of the derivation logic.
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      completedAt: new Date(NOW.getTime() - 6 * 3_600_000),
      doseRatio: 500,
    });

    const results = await generateCandidates("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.ok(findResult(results, "wall_sit").reasonCodes.includes("capability_targets_already_met"));
  });
});

test("excludes everything when today's readiness is red", async () => {
  await withTransaction(async (db) => {
    await insertReadinessEntry(db, { date: TODAY, painNow: 5, computedStatus: "red" });

    const results = await generateCandidates("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.ok(findResult(results, "ninety_ninety_hip_switch").reasonCodes.includes("readiness_red"));
  });
});

test("excludes an elevated-risk exercise when it has no eligible regression", async () => {
  await withTransaction(async (db) => {
    // wall_sit is progressionLevel 1, the lowest in its family/pattern -- no regression exists.
    await insertExerciseResultEvent(db, {
      exerciseId: "wall_sit",
      completedAt: new Date(NOW.getTime() - 3_600_000),
      prescribed: { painLimit: 3 },
      actual: { maxPain: 5 },
      cleanCompletion: false,
    });

    const results = await generateCandidates("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.ok(findResult(results, "wall_sit").reasonCodes.includes("elevated_risk_no_regression"));
  });
});

test("does not exclude an elevated-risk exercise for that reason when a regression is available", async () => {
  await withTransaction(async (db) => {
    // spanish_squat's regression is wall_sit -- an eligible fallback exists.
    await insertExerciseResultEvent(db, {
      exerciseId: "spanish_squat",
      completedAt: new Date(NOW.getTime() - 3_600_000),
      prescribed: { painLimit: 3 },
      actual: { maxPain: 5 },
      cleanCompletion: false,
    });

    const results = await generateCandidates("user-001", "UTC", NOW, PERMISSIVE_PROFILE, db);

    assert.ok(!findResult(results, "spanish_squat").reasonCodes.includes("elevated_risk_no_regression"));
  });
});
