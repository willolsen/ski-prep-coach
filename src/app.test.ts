/**
 * GET /next is wired to the real decision pipeline (MVP Development Order step 8,
 * docs/spec/10-mvp-development-order.md); the other three routes are still
 * scaffolding until step 9. GET /next's own decision logic is thoroughly covered by
 * src/pipeline/getNextAction.test.ts against isolated transactions -- these tests are
 * a thin smoke test of the route wiring itself, run against the real shared pool
 * (no transaction available at the HTTP layer), so the pending recommendation they
 * create is explicitly cleaned up afterward rather than rolled back.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import app from "./app.js";
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

test("POST /results is a 501 stub", async () => {
  const res = await app.request("/api/users/user-001/results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exerciseId: "wall_sit" }),
  });
  assert.equal(res.status, 501);
});

test("POST /log is a 501 stub", async () => {
  const res = await app.request("/api/users/user-001/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries: [] }),
  });
  assert.equal(res.status, 501);
});

test("POST /readiness is a 501 stub", async () => {
  const res = await app.request("/api/users/user-001/readiness", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timezone: "America/Los_Angeles", painNow: 1 }),
  });
  assert.equal(res.status, 501);
});
