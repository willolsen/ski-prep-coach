import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPendingRecommendation, setPendingRecommendation, clearPendingRecommendation } from "./pendingRecommendation.js";
import { withTransaction } from "../testing/withTransaction.js";

// recommendation_id is a real `uuid` column (docs/spec/13-data-layer.md), not the
// human-readable "rec-20260704-001" shown in the Get Next Action example -- that
// example format is illustrative, the schema is the source of truth.
const REC_ID_1 = randomUUID();
const REC_ID_2 = randomUUID();

test("returns null when nothing is pending", async () => {
  await withTransaction(async (db) => {
    const pending = await getPendingRecommendation("user-test-fixture", new Date(), db);
    assert.equal(pending, null);
  });
});

test("returns what was set, with the same recommendationId", async () => {
  await withTransaction(async (db) => {
    const now = new Date();
    await setPendingRecommendation("user-test-fixture", REC_ID_1, { type: "rest" }, now, db);

    const pending = await getPendingRecommendation("user-test-fixture", now, db);

    assert.equal(pending?.recommendationId, REC_ID_1);
    assert.deepEqual(pending?.nextAction, { type: "rest" });
  });
});

test("setting again for the same user overwrites the previous pending recommendation", async () => {
  await withTransaction(async (db) => {
    const now = new Date();
    await setPendingRecommendation("user-test-fixture", REC_ID_1, { type: "rest" }, now, db);
    await setPendingRecommendation("user-test-fixture", REC_ID_2, { type: "exercise" }, now, db);

    const pending = await getPendingRecommendation("user-test-fixture", now, db);

    assert.equal(pending?.recommendationId, REC_ID_2);
    assert.deepEqual(pending?.nextAction, { type: "exercise" });
  });
});

test("is treated as absent once past its 4-hour expiry", async () => {
  await withTransaction(async (db) => {
    const now = new Date();
    await setPendingRecommendation("user-test-fixture", REC_ID_1, { type: "rest" }, now, db);

    const stillPending = await getPendingRecommendation("user-test-fixture", new Date(now.getTime() + 3.9 * 3_600_000), db);
    const expired = await getPendingRecommendation("user-test-fixture", new Date(now.getTime() + 4.1 * 3_600_000), db);

    assert.notEqual(stillPending, null);
    assert.equal(expired, null);
  });
});

test("clearPendingRecommendation removes it", async () => {
  await withTransaction(async (db) => {
    const now = new Date();
    await setPendingRecommendation("user-test-fixture", REC_ID_1, { type: "rest" }, now, db);
    await clearPendingRecommendation("user-test-fixture", db);

    const pending = await getPendingRecommendation("user-test-fixture", now, db);

    assert.equal(pending, null);
  });
});
