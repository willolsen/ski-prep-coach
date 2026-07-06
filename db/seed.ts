/**
 * Seeds reference data (docs/spec/10-mvp-development-order.md step 2): capability
 * definitions, recovery classes, the curated MVP exercise set, and the local dev user.
 * Every upsert is ON CONFLICT DO UPDATE, so this is safe to re-run after editing the
 * seed-data JSON or data/exercises.json.
 *
 * Usage:
 *   npm run db:seed
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const dataDir = path.join(repoRoot, "data");
const seedDataDir = path.join(scriptDir, "seed-data");

interface CapabilityDef {
  name: string;
  priority: number;
  description?: string;
}

interface RecoveryClassDef {
  minRestHours: number;
  maxPerDay: number;
  maxPerWeek: number;
  halfLifeHours: number;
}

interface UserSeed {
  userId: string;
  displayName: string;
  [key: string]: unknown;
}

interface CuratedExercise {
  id: string;
  baseSource: "custom" | "free-exercise-db";
  movementPattern: string;
  familyId: string;
  progressionLevel: number;
  recoveryClass: string;
  riskLevel: string;
  generalWarmthRequired: number;
  movementPatternWarmthRequired: number;
  fatigueCost: number;
  warmthEffect: number;
  capabilityEffects: Record<string, number>;
  [key: string]: unknown;
}

interface UpstreamExercise {
  id: string;
  [key: string]: unknown;
}

// Columns pulled out onto their own exercises columns; everything else on a curated
// exercise entry lands in the `metadata` jsonb column as-is (name, icon, instructions,
// safetyNotes, primaryMuscles, etc. — see docs/spec/13-data-layer.md#reference-tables).
const EXERCISE_COLUMN_FIELDS = new Set([
  "id",
  "baseSource",
  "movementPattern",
  "familyId",
  "progressionLevel",
  "recoveryClass",
  "riskLevel",
  "generalWarmthRequired",
  "movementPatternWarmthRequired",
  "fatigueCost",
  "warmthEffect",
  "capabilityEffects",
]);

async function loadJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}

async function resolveExercises(): Promise<CuratedExercise[]> {
  const curated = (await loadJson<{ exercises: CuratedExercise[] }>(path.join(dataDir, "exercises.json"))).exercises;

  const needsUpstream = curated.some((exercise) => exercise.baseSource === "free-exercise-db");
  if (!needsUpstream) return curated;

  const upstream = await loadJson<UpstreamExercise[]>(path.join(dataDir, "free-exercise-db", "exercises.json"));
  const upstreamById = new Map(upstream.map((exercise) => [exercise.id, exercise]));

  return curated.map((entry) => {
    if (entry.baseSource === "custom") return entry;

    const base = upstreamById.get(entry.id);
    if (!base) {
      throw new Error(`No free-exercise-db entry found for id "${entry.id}" (check data/exercises.json)`);
    }
    return { ...base, ...entry } as CuratedExercise;
  });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const [capabilities, recoveryClasses, users, exercises] = await Promise.all([
    loadJson<Record<string, CapabilityDef>>(path.join(seedDataDir, "capabilities.json")),
    loadJson<Record<string, RecoveryClassDef>>(path.join(seedDataDir, "recovery-classes.json")),
    loadJson<UserSeed[]>(path.join(seedDataDir, "users.json")),
    resolveExercises(),
  ]);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const [capabilityId, def] of Object.entries(capabilities)) {
      await client.query(
        `INSERT INTO capabilities (capability_id, name, priority, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (capability_id) DO UPDATE
           SET name = EXCLUDED.name, priority = EXCLUDED.priority, description = EXCLUDED.description`,
        [capabilityId, def.name, def.priority, def.description ?? null],
      );
    }
    console.log(`Seeded ${Object.keys(capabilities).length} capabilities.`);

    for (const [recoveryClass, def] of Object.entries(recoveryClasses)) {
      await client.query(
        `INSERT INTO recovery_classes (recovery_class, min_rest_hours, max_per_day, max_per_week, half_life_hours)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (recovery_class) DO UPDATE
           SET min_rest_hours = EXCLUDED.min_rest_hours, max_per_day = EXCLUDED.max_per_day,
               max_per_week = EXCLUDED.max_per_week, half_life_hours = EXCLUDED.half_life_hours`,
        [recoveryClass, def.minRestHours, def.maxPerDay, def.maxPerWeek, def.halfLifeHours],
      );
    }
    console.log(`Seeded ${Object.keys(recoveryClasses).length} recovery classes.`);

    for (const user of users) {
      const { userId, displayName, ...profile } = user;
      await client.query(
        `INSERT INTO users (user_id, display_name, profile)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE
           SET display_name = EXCLUDED.display_name, profile = EXCLUDED.profile`,
        [userId, displayName, JSON.stringify(profile)],
      );
    }
    console.log(`Seeded ${users.length} user(s).`);

    for (const exercise of exercises) {
      const metadata: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(exercise)) {
        if (!EXERCISE_COLUMN_FIELDS.has(key)) metadata[key] = value;
      }

      await client.query(
        `INSERT INTO exercises (
           exercise_id, base_source, movement_pattern, family_id, progression_level,
           recovery_class, risk_level, general_warmth_required, movement_pattern_warmth_required,
           fatigue_cost, warmth_effect, capability_effects, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (exercise_id) DO UPDATE
           SET base_source = EXCLUDED.base_source,
               movement_pattern = EXCLUDED.movement_pattern,
               family_id = EXCLUDED.family_id,
               progression_level = EXCLUDED.progression_level,
               recovery_class = EXCLUDED.recovery_class,
               risk_level = EXCLUDED.risk_level,
               general_warmth_required = EXCLUDED.general_warmth_required,
               movement_pattern_warmth_required = EXCLUDED.movement_pattern_warmth_required,
               fatigue_cost = EXCLUDED.fatigue_cost,
               warmth_effect = EXCLUDED.warmth_effect,
               capability_effects = EXCLUDED.capability_effects,
               metadata = EXCLUDED.metadata`,
        [
          exercise.id,
          exercise.baseSource,
          exercise.movementPattern,
          exercise.familyId,
          exercise.progressionLevel,
          exercise.recoveryClass,
          exercise.riskLevel,
          exercise.generalWarmthRequired,
          exercise.movementPatternWarmthRequired,
          exercise.fatigueCost,
          exercise.warmthEffect,
          JSON.stringify(exercise.capabilityEffects),
          JSON.stringify(metadata),
        ],
      );
    }
    console.log(`Seeded ${exercises.length} exercises.`);

    console.log("Done.");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
