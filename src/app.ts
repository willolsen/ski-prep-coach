/**
 * Shared Hono app (docs/spec/14-server-framework.md#shared-app-thin-entry-points).
 * Every deployment target (src/server.ts, src/lambda.ts) wraps this same app; nothing
 * about routes or handlers differs by target.
 *
 * All four routes from docs/spec/05-server-api.md are real. GET /next, POST
 * /results, and POST /log map onto MVP Development Order steps 8-9
 * (docs/spec/10-mvp-development-order.md); POST /readiness isn't called out as its
 * own step there but is implemented alongside the rest. GET /state is a fifth
 * route, not part of the original spec -- see src/pipeline/getDebugState.ts.
 */

import { Hono } from "hono";
import { getNextAction } from "./pipeline/getNextAction.js";
import { getDebugState } from "./pipeline/getDebugState.js";
import { getUserProfile } from "./derivations/userProfile.js";
import { submitResult } from "./pipeline/submitResult.js";
import { logEntries } from "./pipeline/logWithoutRecommendation.js";
import { submitReadiness } from "./pipeline/submitReadiness.js";

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

app.get("/api/users/:userId/state", async (c) => {
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

  const state = await getDebugState(userId, timezone, now, {
    availableEquipment: profile.availableEquipment,
    movementPatternRestrictions: profile.movementPatternRestrictions,
    likes: profile.preferences.likes,
  });

  return c.json(state);
});

app.post("/api/users/:userId/results", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();

  const outcome = await submitResult(userId, body);
  if (!outcome.ok) {
    return c.json({ error: outcome.error }, outcome.status as 409);
  }

  return c.json({ status: "ok", eventId: outcome.eventId });
});

app.post("/api/users/:userId/log", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();

  const eventIds = await logEntries(userId, body.entries ?? []);

  return c.json({ status: "ok", eventIds });
});

app.post("/api/users/:userId/readiness", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();

  const result = await submitReadiness(userId, body);

  return c.json(result);
});

export default app;
