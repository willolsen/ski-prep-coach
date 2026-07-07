/**
 * Shared Hono app (docs/spec/14-server-framework.md#shared-app-thin-entry-points).
 * Every deployment target (src/server.ts, src/lambda.ts) wraps this same app; nothing
 * about routes or handlers differs by target.
 *
 * GET /next is real (MVP Development Order step 8, docs/spec/10-mvp-development-order.md);
 * the remaining three routes are still scaffolding -- POST /result, /log, /readiness
 * land in step 9.
 */

import { Hono } from "hono";
import { getNextAction } from "./pipeline/getNextAction.js";
import { getUserProfile } from "./derivations/userProfile.js";

const app = new Hono();

app.get("/api/users/:userId/next", async (c) => {
  const userId = c.req.param("userId");
  const timezone = c.req.query("timezone");
  if (!timezone) {
    return c.json({ error: "timezone query parameter is required" }, 400);
  }
  const now = new Date(c.req.query("now") ?? new Date().toISOString());

  const profile = await getUserProfile(userId);
  if (!profile) {
    return c.json({ error: `unknown user "${userId}"` }, 404);
  }

  const result = await getNextAction(userId, timezone, now, {
    availableEquipment: profile.availableEquipment,
    movementPatternRestrictions: profile.movementPatternRestrictions,
    likes: profile.preferences.likes,
  });

  return c.json(result);
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
