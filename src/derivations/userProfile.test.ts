import { test } from "node:test";
import assert from "node:assert/strict";
import { getUserProfile } from "./userProfile.js";
import { getPool } from "../db.js";

test("returns the seeded user-001 profile with the expected shape", async () => {
  const profile = await getUserProfile("user-001", getPool());

  assert.equal(profile?.userId, "user-001");
  assert.ok(profile?.availableEquipment.includes("gym"));
  assert.equal(profile?.movementPatternRestrictions.squat, "mild");
  assert.ok(profile?.preferences.likes.includes("hiking"));
});

test("returns null for an unknown user", async () => {
  const profile = await getUserProfile("no-such-user", getPool());
  assert.equal(profile, null);
});
