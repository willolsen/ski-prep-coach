/**
 * Shared Hono app (docs/spec/14-server-framework.md#shared-app-thin-entry-points).
 * Every deployment target (src/server.ts, src/lambda.ts) wraps this same app; nothing
 * about routes or handlers differs by target.
 *
 * Route bodies are scaffolding only (MVP Development Order step 3,
 * docs/spec/10-mvp-development-order.md) — the decision pipeline, result-processing
 * derivations, and data-layer queries that make them real land in later steps.
 */

import { Hono } from "hono";

const app = new Hono();

app.get("/api/users/:userId/next", async (c) => {
  const userId = c.req.param("userId");
  const timezone = c.req.query("timezone");
  if (!timezone) {
    return c.json({ error: "timezone query parameter is required" }, 400);
  }
  const now = c.req.query("now") ?? new Date().toISOString();

  // TODO: decision pipeline (docs/spec/06-decision-pipeline.md) — load state, compute
  // derived state, safety veto, candidate generation/scoring, variation, dose,
  // explanation — using this exact `now`, never an independent clock read.
  return c.json({ error: "not implemented", userId, timezone, now }, 501);
});

app.post("/api/users/:userId/results", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();

  // TODO: store the event (docs/spec/07-result-processing.md#store-event) — the only
  // write this endpoint does; everything else is derived on the next GET /next.
  return c.json({ error: "not implemented", userId, body }, 501);
});

app.post("/api/users/:userId/log", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();

  // TODO: insert one exercise_result event per entry, source "onboarding" | "self_directed",
  // no recommendationId (docs/spec/05-server-api.md#logging-without-a-recommendation).
  return c.json({ error: "not implemented", userId, body }, 501);
});

app.post("/api/users/:userId/readiness", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();
  const now = body.now ?? new Date().toISOString();

  // TODO: derive date from (now, timezone), compute aggregateFatigue as of this same
  // `now`, upsert readiness_entries on (user_id, date) (docs/spec/05-server-api.md#submit-readiness).
  return c.json({ error: "not implemented", userId, now, body }, 501);
});

export default app;
