/**
 * Standalone mock implementation of the two client-facing endpoints from
 * docs/spec/05-server-api.md (GET /next, POST /results), backed by a random
 * exercise picker instead of the real decision pipeline. This exists purely so
 * client UI prototyping can proceed in parallel with the real server work in
 * src/app.ts — it does NOT touch that file, and it runs on its own port.
 *
 * The response shapes match the spec exactly, so the client can be built
 * against this mock and pointed at the real server later with just an env var
 * change (VITE_API_BASE_URL), no code changes.
 *
 * In-memory only, per userId, reset on restart. Not persistence.
 *
 * Usage:
 *   npm run mock:server
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const PORT = Number(process.env.MOCK_PORT ?? 3001);
const REST_PROBABILITY = 0.15;
const RECOMMENDATION_EXPIRY_MS = 4 * 60 * 60 * 1000;
const TARGET_STIMULUS_SCORE = 70;

interface CuratedExercise {
  id: string;
  name: string;
  icon?: string;
  force: string | null;
  category: string;
  movementPattern?: string;
  riskLevel?: string;
  instructions: string[];
  capabilityEffects?: Record<string, number>;
}

interface Prescription {
  sets?: number;
  reps?: number;
  durationSec?: number;
  restSec?: number;
  targetRpe: number;
  painLimit: number;
}

interface NextAction {
  type: "exercise" | "rest";
  recommendationId: string;
  exerciseId?: string;
  title: string;
  icon?: string;
  prescription?: Prescription;
  estimatedDurationSec: number | null;
  instructions: string[];
  completionQuestions: string[];
  why: string[];
}

interface PendingRecommendation {
  nextAction: NextAction;
  createdAtMs: number;
}

interface UserProgress {
  stimulusScore: number;
  capabilityStimulus: Record<string, number>;
}

const CAPABILITY_IDS = [
  "knee_capacity",
  "lower_body_strength",
  "posterior_chain",
  "balance",
  "mobility",
  "aerobic_endurance",
  "stamina",
  "reaction",
  "upper_body_strength",
  "fall_resilience",
];

const WARMTH_STATES = ["cold", "slightly_warm", "warm", "very_warm"];
const READINESS_STATES = ["green", "green", "green", "yellow"]; // weighted toward green

let exercises: CuratedExercise[] = [];
const pendingByUser = new Map<string, PendingRecommendation>();
const progressByUser = new Map<string, UserProgress>();
let recommendationCounter = 0;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(items: T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) throw new Error("pickRandom called with empty array");
  return item;
}

function topCapability(effects: Record<string, number> | undefined): string | undefined {
  if (!effects) return undefined;
  const entries = Object.entries(effects).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0];
}

function synthesizePrescription(exercise: CuratedExercise): { prescription: Prescription; estimatedDurationSec: number } {
  const targetRpe = randomInt(3, 6);
  const painLimit = 3;

  if (exercise.category === "cardio") {
    const durationSec = randomInt(600, 1200);
    return {
      prescription: { durationSec, restSec: 0, targetRpe, painLimit },
      estimatedDurationSec: durationSec,
    };
  }

  if (exercise.force === "static") {
    const sets = 3;
    const durationSec = randomInt(20, 45);
    const restSec = randomInt(45, 60);
    return {
      prescription: { sets, durationSec, restSec, targetRpe, painLimit },
      estimatedDurationSec: sets * (durationSec + restSec),
    };
  }

  const sets = randomInt(2, 3);
  const reps = randomInt(8, 12);
  const restSec = randomInt(45, 60);
  return {
    prescription: { sets, reps, restSec, targetRpe, painLimit },
    estimatedDurationSec: sets * (reps * 3 + restSec),
  };
}

function buildWhy(exercise: CuratedExercise): string[] {
  const capability = topCapability(exercise.capabilityEffects);
  const why: string[] = [];
  if (capability) {
    why.push(`${capability.replace(/_/g, " ")} is currently a limiting capability.`);
  }
  why.push(
    `${exercise.name} provides useful ${exercise.movementPattern?.replace(/_/g, " ") ?? "general"} stimulus` +
      `${exercise.riskLevel ? ` with ${exercise.riskLevel} risk` : ""}.`,
  );
  why.push("(Mocked reasoning — the real decision pipeline will replace this.)");
  return why;
}

function generateExerciseAction(): NextAction {
  const exercise = pickRandom(exercises);
  const { prescription, estimatedDurationSec } = synthesizePrescription(exercise);
  recommendationCounter += 1;
  return {
    type: "exercise",
    recommendationId: `rec-mock-${Date.now()}-${recommendationCounter}`,
    exerciseId: exercise.id,
    title: exercise.name,
    icon: exercise.icon ?? "🏔️",
    prescription,
    estimatedDurationSec,
    instructions: exercise.instructions,
    completionQuestions: [
      "How many sets did you complete?",
      "What was the highest pain level?",
      "What was the effort level, 1-10?",
      "Anything unusual?",
    ],
    why: buildWhy(exercise),
  };
}

function generateRestAction(): NextAction {
  recommendationCounter += 1;
  return {
    type: "rest",
    recommendationId: `rec-mock-${Date.now()}-${recommendationCounter}`,
    title: "Rest Is the Best Next Action",
    estimatedDurationSec: null,
    instructions: [
      "No more training is recommended right now.",
      "Normal walking and daily activity are fine.",
      "Resume when the app recommends another action.",
    ],
    completionQuestions: [],
    why: ["(Mocked) Today's simulated training stimulus has already been reached."],
  };
}

function getOrInitProgress(userId: string): UserProgress {
  let progress = progressByUser.get(userId);
  if (!progress) {
    progress = { stimulusScore: randomInt(10, 30), capabilityStimulus: {} };
    progressByUser.set(userId, progress);
  }
  return progress;
}

function todayProgressFor(userId: string) {
  const progress = getOrInitProgress(userId);
  const percentComplete = Math.min(100, Math.round((progress.stimulusScore / TARGET_STIMULUS_SCORE) * 100));
  return {
    status: progress.stimulusScore >= TARGET_STIMULUS_SCORE ? "complete" : "in_progress",
    stimulusScore: progress.stimulusScore,
    targetStimulusScore: TARGET_STIMULUS_SCORE,
    percentComplete,
  };
}

function stateSummary() {
  const limitingCount = randomInt(1, 2);
  const shuffled = [...CAPABILITY_IDS].sort(() => Math.random() - 0.5);
  return {
    readiness: pickRandom(READINESS_STATES),
    warmth: pickRandom(WARMTH_STATES),
    limitingCapabilities: shuffled.slice(0, limitingCount),
  };
}

const app = new Hono();

// The client (Vite dev server, a different origin/port) needs this to fetch
// cross-origin. The real server will presumably need the same for browser
// clients, but that's the other developer's call — not addressed here.
app.use("/api/*", cors());

app.get("/api/users/:userId/next", (c) => {
  const userId = c.req.param("userId");
  const timezone = c.req.query("timezone");
  if (!timezone) {
    return c.json({ error: "timezone query parameter is required" }, 400);
  }
  const nowMs = c.req.query("now") ? new Date(c.req.query("now")!).getTime() : Date.now();

  const existing = pendingByUser.get(userId);
  if (existing && nowMs - existing.createdAtMs < RECOMMENDATION_EXPIRY_MS) {
    return c.json({
      nextAction: existing.nextAction,
      todayProgress: todayProgressFor(userId),
      stateSummary: stateSummary(),
    });
  }

  const nextAction = Math.random() < REST_PROBABILITY ? generateRestAction() : generateExerciseAction();
  pendingByUser.set(userId, { nextAction, createdAtMs: nowMs });

  return c.json({
    nextAction,
    todayProgress: todayProgressFor(userId),
    stateSummary: stateSummary(),
  });
});

app.post("/api/users/:userId/results", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json<{ recommendationId?: string; exerciseId?: string; actual?: unknown }>();

  const pending = pendingByUser.get(userId);
  if (!pending) {
    return c.json({ error: "No pending recommendation for this user" }, 409);
  }
  if (!body.recommendationId || body.recommendationId !== pending.nextAction.recommendationId) {
    return c.json({ error: "recommendationId does not match the pending recommendation" }, 400);
  }

  pendingByUser.delete(userId);

  const exercise = body.exerciseId ? exercises.find((e) => e.id === body.exerciseId) : undefined;
  const progress = getOrInitProgress(userId);
  if (exercise?.capabilityEffects) {
    for (const [capability, value] of Object.entries(exercise.capabilityEffects)) {
      progress.capabilityStimulus[capability] = (progress.capabilityStimulus[capability] ?? 0) + value;
      progress.stimulusScore += value;
    }
  }

  console.log(`[mock] ${userId} submitted result for ${body.exerciseId ?? "rest"}:`, body.actual ?? {});

  return c.json({ status: "ok", eventId: `mock-evt-${Date.now()}` });
});

async function main(): Promise<void> {
  const exercisesText = await readFile(path.join(repoRoot, "data", "exercises.json"), "utf-8");
  exercises = (JSON.parse(exercisesText) as { exercises: CuratedExercise[] }).exercises;
  console.log(`Loaded ${exercises.length} exercises.`);

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`Mock API listening on http://localhost:${info.port}`);
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
