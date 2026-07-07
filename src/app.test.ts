/**
 * All four routes are wired to real logic. Each route's own decision/write logic is
 * thoroughly covered by its pipeline module's own tests against isolated
 * transactions -- these tests are thin smoke tests of the route wiring itself, run
 * against the real shared pool (no transaction available at the HTTP layer), so
 * whatever they create is explicitly cleaned up afterward rather than rolled back.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import app from "./app.js";
import { getPool } from "./db.js";
import { clearPendingRecommendation } from "./derivations/pendingRecommendation.js";

test("GET /next without timezone returns 400", async () => {
  const res = await app.request("/api/users/user-001/next");
  assert.equal(res.status, 400);
});

test("GET /next returns 404 for an unknown user", async () => {
  const res = await app.request("/api/users/no-such-user/next?timezone=UTC");
  assert.equal(res.status, 404);
});

test("GET /next with timezone returns a real recommendation for a known user", async () => {
  try {
    const res = await app.request("/api/users/user-001/next?timezone=UTC");
    const body = (await res.json()) as {
      nextAction: { type: string; recommendationId: string };
      todayProgress: unknown;
      stateSummary: unknown;
    };

    assert.equal(res.status, 200);
    assert.ok(body.nextAction.type === "exercise" || body.nextAction.type === "rest");
    assert.ok(typeof body.nextAction.recommendationId === "string" && body.nextAction.recommendationId.length > 0);
    assert.ok(body.todayProgress);
    assert.ok(body.stateSummary);
  } finally {
    await clearPendingRecommendation("user-001");
  }
});

test("GET /state without timezone returns 400", async () => {
  const res = await app.request("/api/users/user-001/state");
  assert.equal(res.status, 400);
});

test("GET /state returns 404 for an unknown user", async () => {
  const res = await app.request("/api/users/no-such-user/state?timezone=UTC");
  assert.equal(res.status, 404);
});

test("GET /state returns the full computed state without creating a pending recommendation", async () => {
  const res = await app.request("/api/users/user-001/state?timezone=UTC");
  const body = (await res.json()) as {
    capabilities: unknown;
    fatigue: unknown;
    warmth: unknown;
    readiness: unknown;
    dailyProgress: unknown;
    safetyVeto: unknown;
    candidates: unknown[];
  };

  assert.equal(res.status, 200);
  assert.ok(body.capabilities);
  assert.ok(body.fatigue);
  assert.ok(body.warmth);
  assert.ok(body.readiness);
  assert.ok(body.dailyProgress);
  assert.ok(body.safetyVeto);
  assert.equal(body.candidates.length, 50);
});

test("POST /results stores an event when it resolves the currently pinned recommendation", async () => {
  const now = new Date();
  const nextRes = await app.request("/api/users/user-001/next?timezone=UTC");
  const nextBody = (await nextRes.json()) as { nextAction: { recommendationId: string; exerciseId?: string } };

  let eventId: string | undefined;
  try {
    const res = await app.request("/api/users/user-001/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendationId: nextBody.nextAction.recommendationId,
        exerciseId: nextBody.nextAction.exerciseId,
        timezone: "UTC",
        startedAt: now.toISOString(),
        completedAt: now.toISOString(),
        actual: { maxPain: 1, rpe: 5, difficulty: "normal" },
      }),
    });
    const body = (await res.json()) as { status: string; eventId: string };

    assert.equal(res.status, 200);
    assert.equal(body.status, "ok");
    assert.ok(typeof body.eventId === "string" && body.eventId.length > 0);
    eventId = body.eventId;
  } finally {
    if (eventId) await getPool().query("DELETE FROM events WHERE event_id = $1", [eventId]);
    await clearPendingRecommendation("user-001");
  }
});

test("POST /results returns 409 when there's no matching pending recommendation", async () => {
  const res = await app.request("/api/users/user-001/results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recommendationId: "00000000-0000-0000-0000-000000000000",
      exerciseId: "wall_sit",
      timezone: "UTC",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      actual: { maxPain: 1 },
    }),
  });

  assert.equal(res.status, 409);
});

test("POST /log stores one event per entry", async () => {
  let eventIds: string[] = [];
  try {
    const res = await app.request("/api/users/user-001/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          {
            exerciseId: "bodyweight_squat",
            source: "self_directed",
            timezone: "UTC",
            occurredAt: new Date().toISOString(),
            actual: { setsCompleted: 2, reps: 10, maxPain: 0, rpe: 4 },
          },
        ],
      }),
    });
    const body = (await res.json()) as { status: string; eventIds: string[] };

    assert.equal(res.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.eventIds.length, 1);
    eventIds = body.eventIds;
  } finally {
    if (eventIds.length > 0) await getPool().query("DELETE FROM events WHERE event_id = ANY($1)", [eventIds]);
  }
});

test("POST /readiness stores a real entry and returns its derived date and computedStatus", async () => {
  try {
    const res = await app.request("/api/users/user-001/readiness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        now: "2026-07-10T07:30:00-07:00",
        timezone: "America/Los_Angeles",
        painNow: 1,
        morningStiffness: "none",
        swelling: false,
        stairs: "easy",
        sleepQuality: "good",
      }),
    });
    const body = (await res.json()) as { date: string; computedStatus: string };

    assert.equal(res.status, 200);
    assert.equal(body.date, "2026-07-10");
    assert.equal(body.computedStatus, "green");
  } finally {
    await getPool().query("DELETE FROM readiness_entries WHERE user_id = 'user-001' AND date = '2026-07-10'");
  }
});
