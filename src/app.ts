/**
 * Shared Hono app (docs/spec/14-server-framework.md#shared-app-thin-entry-points).
 * Every deployment target (src/server.ts, src/lambda.ts) wraps this same app; nothing
 * about routes or handlers differs by target.
 *
 * All four routes from docs/spec/05-server-api.md are real. GET /next, POST
 * /results, and POST /log map onto MVP Development Order steps 8-9
 * (docs/spec/10-mvp-development-order.md); POST /readiness isn't called out as its
 * own step there but is implemented alongside the rest. GET /state (debug view,
 * src/pipeline/getDebugState.ts) and GET /exercise-images/:file (static assets)
 * are not part of the original spec.
 *
 * CORS is enabled on /api/* so a browser client on a different origin (the Vite
 * dev server) can call this directly -- see client/README.md's "Mock -> real
 * swap" section.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getNextAction } from "./pipeline/getNextAction.js";
import { getDebugState } from "./pipeline/getDebugState.js";
import { getUserProfile } from "./derivations/userProfile.js";
import { submitResult } from "./pipeline/submitResult.js";
import { logEntries } from "./pipeline/logWithoutRecommendation.js";
import { submitReadiness } from "./pipeline/submitReadiness.js";
import { getRecentExerciseHistory } from "./derivations/history.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const app = new Hono();

// A browser client on a different origin/port (the Vite dev server) needs this
// to fetch cross-origin (docs/spec/14-server-framework.md's known auth gap notes
// there's no per-client trust model yet; this mirrors scripts/mock-server.ts's
// identical cors() use, scoped the same way to /api/*).
app.use("/api/*", cors());

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

// Not part of the spec's four endpoints -- same precedent as GET /state, added
// to back a client history view (src/derivations/history.ts).
app.get("/api/users/:userId/history", async (c) => {
  const userId = c.req.param("userId");
  const limit = Number(c.req.query("limit") ?? 50);

  const history = await getRecentExerciseHistory(userId, limit);

  return c.json({ history });
});

// Serves the AI-generated exercise illustrations from data/generated-images/, so
// the browser client can show a real image per exercise. Not part of the spec's
// API contract (docs/spec/05-server-api.md has no image field) -- the client
// derives this URL itself from exerciseId (client/src/api/client.ts's
// exerciseImageUrl()), which the contract does provide. Mirrors
// scripts/mock-server.ts's identical route, which this real server previously
// lacked (the client was only ever pointed at the mock for this).
app.get("/exercise-images/:file", async (c) => {
  const file = c.req.param("file");
  const id = file.replace(/\.png$/, "");
  if (!/^[0-9a-zA-Z_-]+$/.test(id)) {
    return c.notFound();
  }
  try {
    const buffer = await readFile(path.join(repoRoot, "data", "generated-images", `${id}.png`));
    return c.body(buffer, 200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" });
  } catch {
    return c.notFound();
  }
});

export default app;
