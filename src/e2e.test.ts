/**
 * Full multi-step user journeys, exercised over real HTTP requests through the
 * Hono app (matching exactly what client/src/api/client.ts sends) rather than
 * individual derivation/pipeline functions -- those are already thoroughly
 * covered elsewhere. This file exists to catch contract-level regressions across
 * a whole session (GET /next -> POST /results -> GET /next -> GET /history),
 * the same shape of flow the client actually performs.
 *
 * Run against the real shared pool (same reasoning as app.test.ts: no
 * transaction is available at the HTTP layer), so everything each test creates
 * is explicitly cleaned up in a `finally` block rather than rolled back. Uses
 * its own dedicated, permanently-seeded user (db/seed-data/users.json's
 * "user-e2e-test") -- not user-001 (that's the real app user; its event history
 * is no longer empty now that it's in real use, which breaks any test asserting
 * an exact count or capability score for it), and not user-test-fixture either
 * (that one's reserved for the rest of the suite's purely-transactional tests;
 * sharing it here would reintroduce the exact same real-committed-row collision
 * this split exists to avoid, just between this file and those instead of
 * against user-001).
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import app from "./app.js";
import { getPool } from "./db.js";
import { clearPendingRecommendation } from "./derivations/pendingRecommendation.js";

const USER_ID = "user-e2e-test";

// Safety net in case a test fails before its own `finally` cleanup runs.
after(async () => {
  await getPool().query(`DELETE FROM events WHERE user_id = $1`, [USER_ID]);
  await getPool().query(`DELETE FROM readiness_entries WHERE user_id = $1`, [USER_ID]);
  await getPool().query(`DELETE FROM pending_recommendations WHERE user_id = $1`, [USER_ID]);
});

interface NextActionBody {
  nextAction: { type: string; recommendationId: string; exerciseId?: string };
}

async function fetchNext(now: string): Promise<NextActionBody> {
  const res = await app.request(`/api/users/${USER_ID}/next?timezone=America/Los_Angeles&now=${encodeURIComponent(now)}`);
  const body = await res.json();
  // Read the body exactly once (as JSON) -- passing `await res.text()` as an
  // assert message argument evaluates it unconditionally (even on success,
  // since JS evaluates all arguments before calling the function), which
  // consumes the response body stream and makes a later res.json() throw
  // "Body is unusable: Body has already been read."
  assert.equal(res.status, 200, `GET /next failed: ${JSON.stringify(body)}`);
  return body as NextActionBody;
}

async function submit(recommendationId: string, exerciseId: string | undefined, now: string): Promise<string> {
  const res = await app.request(`/api/users/${USER_ID}/results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recommendationId,
      exerciseId,
      timezone: "America/Los_Angeles",
      startedAt: now,
      completedAt: now,
      actual: { maxPain: 0, rpe: 4, difficulty: "normal", durationSecCompleted: 60, setsCompleted: 1 },
    }),
  });
  const body = (await res.json()) as { eventId: string; error?: string };
  assert.equal(res.status, 200, `POST /results failed: ${JSON.stringify(body)}`);
  return body.eventId;
}

test("a full session round-trips: GET /next -> POST /results -> GET /history shows it", async () => {
  const eventIds: string[] = [];
  try {
    const now = "2026-08-01T09:00:00-07:00";
    const next = await fetchNext(now);
    eventIds.push(await submit(next.nextAction.recommendationId, next.nextAction.exerciseId, now));

    const historyRes = await app.request(`/api/users/${USER_ID}/history?limit=50`);
    assert.equal(historyRes.status, 200);
    const { history } = (await historyRes.json()) as {
      history: { eventId: string; exerciseId: string; title: string; icon: string | null; date: string }[];
    };

    const entry = history.find((h) => h.eventId === eventIds[0]);
    assert.ok(entry, "the just-submitted event should appear in history");
    if (next.nextAction.type === "exercise") {
      assert.equal(entry!.exerciseId, next.nextAction.exerciseId);
      assert.ok(entry!.title.length > 0);
      assert.equal(entry!.date, "2026-08-01");
    }
  } finally {
    if (eventIds.length > 0) await getPool().query("DELETE FROM events WHERE event_id = ANY($1)", [eventIds]);
    await clearPendingRecommendation(USER_ID);
  }
});

test("history groups entries across a simulated day boundary correctly, most-recent-first", async () => {
  const eventIds: string[] = [];
  try {
    const day1 = "2026-08-02T20:00:00-07:00";
    const next1 = await fetchNext(day1);
    eventIds.push(await submit(next1.nextAction.recommendationId, next1.nextAction.exerciseId, day1));

    // Simulated time-travel: several hours forward, past local midnight.
    const day2 = "2026-08-03T02:00:00-07:00";
    const next2 = await fetchNext(day2);
    eventIds.push(await submit(next2.nextAction.recommendationId, next2.nextAction.exerciseId, day2));

    const historyRes = await app.request(`/api/users/${USER_ID}/history?limit=50`);
    const { history } = (await historyRes.json()) as { history: { eventId: string; date: string }[] };

    const entry1 = history.find((h) => h.eventId === eventIds[0]);
    const entry2 = history.find((h) => h.eventId === eventIds[1]);
    assert.ok(entry1 && entry2);
    assert.equal(entry1!.date, "2026-08-02");
    assert.equal(entry2!.date, "2026-08-03");

    const index1 = history.findIndex((h) => h.eventId === eventIds[0]);
    const index2 = history.findIndex((h) => h.eventId === eventIds[1]);
    assert.ok(index2 < index1, "the more recent (day2) entry should come first");
  } finally {
    if (eventIds.length > 0) await getPool().query("DELETE FROM events WHERE event_id = ANY($1)", [eventIds]);
    await clearPendingRecommendation(USER_ID);
  }
});

test("GET /history defaults to 50 when limit is omitted, matching the client's default", async () => {
  const res = await app.request(`/api/users/${USER_ID}/history`);
  assert.equal(res.status, 200);
  const { history } = (await res.json()) as { history: unknown[] };
  assert.ok(history.length <= 50);
});

test("a resolved rest recommendation does not appear in history", async () => {
  // Force a rest recommendation via the safety veto (red readiness), acknowledge
  // it, and confirm history -- which only ever queries exercise_result events --
  // is unaffected.
  const now = "2026-08-04T09:00:00-07:00";
  try {
    await app.request(`/api/users/${USER_ID}/readiness`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        now,
        timezone: "America/Los_Angeles",
        painNow: 5,
        morningStiffness: "significant",
        swelling: false,
        stairs: "easy",
        sleepQuality: "poor",
      }),
    });

    const next = await fetchNext(now);
    assert.equal(next.nextAction.type, "rest");

    const beforeRes = await app.request(`/api/users/${USER_ID}/history?limit=50`);
    const before = ((await beforeRes.json()) as { history: unknown[] }).history.length;

    const res = await app.request(`/api/users/${USER_ID}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendationId: next.nextAction.recommendationId,
        timezone: "America/Los_Angeles",
        startedAt: now,
        completedAt: now,
        actual: { notes: "acknowledged" },
      }),
    });
    assert.equal(res.status, 200);

    const afterRes = await app.request(`/api/users/${USER_ID}/history?limit=50`);
    const after = ((await afterRes.json()) as { history: unknown[] }).history.length;
    assert.equal(after, before, "resolving a rest recommendation should not add a history entry");
  } finally {
    await getPool().query(
      `DELETE FROM events WHERE user_id = $1 AND type = 'rest' AND started_at = $2::timestamptz`,
      [USER_ID, now],
    );
    await getPool().query(`DELETE FROM readiness_entries WHERE user_id = $1 AND date = '2026-08-04'`, [USER_ID]);
    await clearPendingRecommendation(USER_ID);
  }
});

test("advancing simulated `now` across multiple GET /next calls changes the recommendation over time", async () => {
  // Mirrors the client's time-travel controls: the same mechanism (an explicit
  // `now` query param), not a separate code path.
  const start = new Date("2026-08-05T06:00:00-07:00");
  const first = await fetchNext(start.toISOString());

  try {
    // Same instant queried twice should return the identical pinned recommendation.
    const repeat = await fetchNext(start.toISOString());
    assert.equal(repeat.nextAction.recommendationId, first.nextAction.recommendationId);

    // 5 hours later, past the 4-hour pin expiry, should recompute fresh (a new id
    // even if the same action happens to be chosen again).
    const later = new Date(start.getTime() + 5 * 3_600_000);
    const afterExpiry = await fetchNext(later.toISOString());
    assert.notEqual(afterExpiry.nextAction.recommendationId, first.nextAction.recommendationId);
  } finally {
    await clearPendingRecommendation(USER_ID);
  }
});
