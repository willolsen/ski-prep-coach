/**
 * Backfills onboarding history (docs/spec/05-server-api.md#logging-without-a-recommendation,
 * MVP Development Order step 11, docs/spec/10-mvp-development-order.md) from a JSON
 * file of ordinary log entries, so the capability-score replay and other derived
 * state aren't starting from a blank slate on day one.
 *
 * data/onboarding-history.json ships as an empty array on purpose -- this doesn't
 * fabricate history, it only replays what you put there. Fill it in with your own
 * real recent sessions (source "onboarding" for backfilled past sessions,
 * "self_directed" for something you did that wasn't a recommendation), each entry
 * shaped like:
 *
 *   {
 *     "exerciseId": "bodyweight_squat",
 *     "source": "onboarding",
 *     "timezone": "America/Los_Angeles",
 *     "occurredAt": "2026-06-20T09:00:00-07:00",
 *     "actual": { "setsCompleted": 3, "reps": 10, "maxPain": 1, "rpe": 5 }
 *   }
 *
 * exerciseId must match a seeded exercise id (see data/exercises.json).
 *
 * Usage:
 *   npm run backfill:history
 *   BACKFILL_USER_ID=user-002 npm run backfill:history
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logEntries, type LogEntry } from "../src/pipeline/logWithoutRecommendation.js";
import { getPool } from "../src/db.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const historyPath = path.join(repoRoot, "data", "onboarding-history.json");

const userId = process.env.BACKFILL_USER_ID ?? "user-001";

async function main(): Promise<void> {
  const text = await readFile(historyPath, "utf-8");
  const entries = JSON.parse(text) as LogEntry[];

  if (entries.length === 0) {
    console.log(
      `${path.relative(repoRoot, historyPath)} is empty -- add your real history entries first (see this script's own header comment for the shape). Nothing to backfill.`,
    );
    return;
  }

  const eventIds = await logEntries(userId, entries);
  console.log(`Backfilled ${eventIds.length} event(s) for ${userId}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
