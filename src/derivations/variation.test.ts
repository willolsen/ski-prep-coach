import { test } from "node:test";
import assert from "node:assert/strict";
import { getSubstitutes, getRegression, getProgression } from "./variation.js";

// squat_isometric_iso family: wall_sit (level 1), spanish_squat (level 2),
// banded_terminal_knee_extension (level 3) -- all seeded reference data, read-only.

test("substitutes rank same-family exercises before same-pattern-only fallbacks", async () => {
  const substitutes = await getSubstitutes("wall_sit");
  const sameFamilyIds = substitutes.filter((e) => e.familyId === "squat_isometric_iso").map((e) => e.exerciseId);
  const firstFallbackIndex = substitutes.findIndex((e) => e.familyId !== "squat_isometric_iso");

  assert.ok(sameFamilyIds.includes("spanish_squat"));
  assert.ok(sameFamilyIds.includes("banded_terminal_knee_extension"));
  // Every same-family row appears before the first fallback (same-pattern-only) row.
  const lastSameFamilyIndex = substitutes.findIndex((e) => e.exerciseId === sameFamilyIds[sameFamilyIds.length - 1]);
  assert.ok(firstFallbackIndex === -1 || lastSameFamilyIndex < firstFallbackIndex);
});

test("getRegression returns the nearest lower progressionLevel in the same family", async () => {
  const regression = await getRegression("spanish_squat");
  assert.equal(regression?.exerciseId, "wall_sit");
});

test("getProgression returns the nearest higher progressionLevel in the same family", async () => {
  const progression = await getProgression("wall_sit");
  assert.equal(progression?.exerciseId, "spanish_squat");
});

test("getRegression returns null when nothing has a lower progressionLevel", async () => {
  // wall_sit is progressionLevel 1, the lowest in its family and its movementPattern fallback set.
  const regression = await getRegression("wall_sit");
  assert.equal(regression, null);
});
