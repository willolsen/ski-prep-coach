/**
 * Scaffold-level tests only (docs/spec/10-mvp-development-order.md step 3): the request
 * contract that will stay true regardless of business logic (timezone required, now
 * defaulting), plus a pin on the current 501 stub responses. The 501 assertions are
 * expected to need rewriting as soon as the decision pipeline and event-storage steps
 * land -- that's normal churn, not a smell.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import app from "./app.js";

test("GET /next without timezone returns 400", async () => {
  const res = await app.request("/api/users/user-001/next");
  assert.equal(res.status, 400);
});

test("GET /next with timezone is a 501 stub that echoes the parsed params", async () => {
  const res = await app.request("/api/users/user-001/next?timezone=America/Los_Angeles");
  const body = (await res.json()) as { userId: string; timezone: string; now: string };

  assert.equal(res.status, 501);
  assert.equal(body.userId, "user-001");
  assert.equal(body.timezone, "America/Los_Angeles");
  assert.ok(body.now);
});

test("GET /next defaults now to roughly the real clock when omitted", async () => {
  const before = Date.now();
  const res = await app.request("/api/users/user-001/next?timezone=UTC");
  const body = (await res.json()) as { now: string };
  const after = Date.now();

  const now = new Date(body.now).getTime();
  assert.ok(now >= before && now <= after);
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
