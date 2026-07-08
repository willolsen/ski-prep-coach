/**
 * Interactive CLI for adding a new custom exercise (docs/spec/03-exercises-and-recovery.md#exercise-definition):
 * prompts for every field required to make it recommendable, appends it to
 * data/exercises.json, then optionally generates its illustration (by invoking
 * `npm run generate:images`, the existing tool -- this script doesn't duplicate
 * that logic) and reseeds the database (`npm run db:seed`, idempotent).
 *
 * Usage:
 *   npm run add:exercise
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { MOVEMENT_PATTERNS } from "../src/derivations/fatigueWarmth.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const dataDir = path.join(repoRoot, "data");
const exercisesPath = path.join(dataDir, "exercises.json");

const RISK_LEVELS = ["low", "moderate", "high"] as const;
const FORCE_OPTIONS = ["static", "pull", "push"] as const;
const LEVEL_OPTIONS = ["beginner", "intermediate", "expert"] as const;
const MECHANIC_OPTIONS = ["isolation", "compound"] as const;
const EQUIPMENT_OPTIONS = [
  "medicine ball", "dumbbell", "body only", "bands", "kettlebells", "foam roll",
  "cable", "machine", "barbell", "exercise ball", "e-z curl bar", "other",
] as const;
const CATEGORY_OPTIONS = [
  "powerlifting", "strength", "stretching", "cardio", "olympic weightlifting", "strongman", "plyometrics",
] as const;
const MUSCLE_OPTIONS = [
  "abdominals", "abductors", "adductors", "biceps", "calves", "chest", "forearms", "glutes",
  "hamstrings", "lats", "lower back", "middle back", "neck", "quadriceps", "shoulders", "traps", "triceps",
] as const;

interface CuratedExercise {
  id: string;
  baseSource: "custom" | "free-exercise-db";
  healthIcon?: string;
  name: string;
  icon: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
  movementPattern: string;
  familyId: string;
  progressionLevel: number;
  variantTags: string[];
  safetyNotes: string[];
  generalWarmthRequired: number;
  movementPatternWarmthRequired: number;
  riskLevel: string;
  recoveryClass: string;
  capabilityEffects: Record<string, number>;
  fatigueCost: number;
  warmthEffect: number;
}

const rl = createInterface({ input: stdin, output: stdout });

async function ask(question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue !== undefined ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue || "";
}

async function askRequired(question: string): Promise<string> {
  for (;;) {
    const answer = (await rl.question(`${question}: `)).trim();
    if (answer) return answer;
    console.log("  (required)");
  }
}

async function askNumber(question: string, defaultValue?: number): Promise<number> {
  for (;;) {
    const raw = await ask(question, defaultValue?.toString());
    const num = Number(raw);
    if (raw !== "" && !Number.isNaN(num)) return num;
    console.log("  Please enter a number.");
  }
}

async function askEnum<T extends string>(question: string, options: readonly T[], defaultValue?: T): Promise<T> {
  console.log(`  Options: ${options.join(", ")}`);
  for (;;) {
    const raw = await ask(question, defaultValue);
    if ((options as readonly string[]).includes(raw)) return raw as T;
    console.log(`  Must be one of: ${options.join(", ")}`);
  }
}

async function askOptionalEnum<T extends string>(question: string, options: readonly T[]): Promise<T | null> {
  console.log(`  Options: ${options.join(", ")} (blank for none)`);
  for (;;) {
    const raw = (await rl.question(`${question}: `)).trim();
    if (!raw) return null;
    if ((options as readonly string[]).includes(raw)) return raw as T;
    console.log(`  Must be one of: ${options.join(", ")}, or blank`);
  }
}

async function askMuscleList(question: string): Promise<string[]> {
  for (;;) {
    const raw = await ask(`${question} (comma-separated, blank for none)`);
    if (!raw) return [];
    const muscles = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const invalid = muscles.filter((m) => !(MUSCLE_OPTIONS as readonly string[]).includes(m));
    if (invalid.length > 0) {
      console.log(`  Invalid muscle(s): ${invalid.join(", ")}. Valid: ${MUSCLE_OPTIONS.join(", ")}`);
      continue;
    }
    return muscles;
  }
}

async function askList(question: string): Promise<string[]> {
  const raw = await ask(`${question} (comma-separated, blank for none)`);
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

async function askMultiline(question: string): Promise<string[]> {
  console.log(`${question} (one per line, blank line to finish):`);
  const lines: string[] = [];
  for (;;) {
    const line = (await rl.question("  > ")).trim();
    if (!line) break;
    lines.push(line);
  }
  return lines;
}

async function askYesNo(question: string, defaultYes: boolean): Promise<boolean> {
  const raw = (await rl.question(`${question} (${defaultYes ? "Y/n" : "y/N"}): `)).trim().toLowerCase();
  if (!raw) return defaultYes;
  return raw === "y" || raw === "yes";
}

async function askCapabilityEffects(validCapabilityIds: string[]): Promise<Record<string, number>> {
  console.log(`Capability effects -- which capabilities does this exercise train, and how much?`);
  console.log(`  Available: ${validCapabilityIds.join(", ")}`);
  const effects: Record<string, number> = {};
  for (;;) {
    const raw = (await rl.question("  capability id (blank to finish): ")).trim();
    if (!raw) break;
    if (!validCapabilityIds.includes(raw)) {
      console.log(`  Unknown capability "${raw}". Must be one of: ${validCapabilityIds.join(", ")}`);
      continue;
    }
    effects[raw] = await askNumber(`  ${raw} stimulus value`);
  }
  return effects;
}

async function loadJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}

// data/exercises.json has no Prettier config behind it -- its short-list arrays
// (primaryMuscles, variantTags, ...) are hand-formatted on one line while prose
// arrays (instructions, safetyNotes) are one string per line. A full
// JSON.stringify(..., null, 2) round-trip doesn't know that convention and
// reformats every existing entry, producing a huge diff. So instead of
// reserializing the whole file, this builds just the new entry's text in the same
// style and splices it in after the last existing entry -- every other byte of
// the file, and its CRLF line endings, are left untouched.

function formatInlineArray(items: string[]): string {
  return `[${items.map((item) => JSON.stringify(item)).join(", ")}]`;
}

function formatInlineNumberObject(obj: Record<string, number>): string {
  const entries = Object.entries(obj).map(([key, value]) => `${JSON.stringify(key)}: ${value}`);
  return `{ ${entries.join(", ")} }`;
}

function formatMultilineStringArray(items: string[], fieldIndent: string): string {
  if (items.length === 0) return "[]";
  const inner = items.map((item) => `${fieldIndent}  ${JSON.stringify(item)}`).join(",\n");
  return `[\n${inner}\n${fieldIndent}]`;
}

function formatExerciseEntry(exercise: CuratedExercise): string {
  const indent = "    "; // exercise object's own indent (nested one level inside the array)
  const fieldIndent = `${indent}  `;

  const lines: string[] = [];
  const field = (key: string, valueText: string) => lines.push(`${fieldIndent}${JSON.stringify(key)}: ${valueText}`);

  field("id", JSON.stringify(exercise.id));
  field("baseSource", JSON.stringify(exercise.baseSource));
  if (exercise.healthIcon) field("healthIcon", JSON.stringify(exercise.healthIcon));
  field("name", JSON.stringify(exercise.name));
  field("icon", JSON.stringify(exercise.icon));
  field("force", exercise.force === null ? "null" : JSON.stringify(exercise.force));
  field("level", JSON.stringify(exercise.level));
  field("mechanic", exercise.mechanic === null ? "null" : JSON.stringify(exercise.mechanic));
  field("equipment", exercise.equipment === null ? "null" : JSON.stringify(exercise.equipment));
  field("primaryMuscles", formatInlineArray(exercise.primaryMuscles));
  field("secondaryMuscles", formatInlineArray(exercise.secondaryMuscles));
  field("instructions", formatMultilineStringArray(exercise.instructions, fieldIndent));
  field("category", JSON.stringify(exercise.category));
  field("images", formatInlineArray(exercise.images));
  field("movementPattern", JSON.stringify(exercise.movementPattern));
  field("familyId", JSON.stringify(exercise.familyId));
  field("progressionLevel", String(exercise.progressionLevel));
  field("variantTags", formatInlineArray(exercise.variantTags));
  field("safetyNotes", formatMultilineStringArray(exercise.safetyNotes, fieldIndent));
  field("generalWarmthRequired", String(exercise.generalWarmthRequired));
  field("movementPatternWarmthRequired", String(exercise.movementPatternWarmthRequired));
  field("riskLevel", JSON.stringify(exercise.riskLevel));
  field("recoveryClass", JSON.stringify(exercise.recoveryClass));
  field("capabilityEffects", formatInlineNumberObject(exercise.capabilityEffects));
  field("fatigueCost", String(exercise.fatigueCost));
  field("warmthEffect", String(exercise.warmthEffect));

  return `${indent}{\n${lines.join(",\n")}\n${indent}}`;
}

async function appendExerciseToFile(exercise: CuratedExercise, exerciseCount: number): Promise<void> {
  const raw = await readFile(exercisesPath, "utf-8");
  const newlineStyle = raw.includes("\r\n") ? "\r\n" : "\n";
  const entryText = formatExerciseEntry(exercise).split("\n").join(newlineStyle);

  if (exerciseCount === 0) {
    // Empty array: `"exercises": [` immediately followed by `]` -- insert the
    // first entry between them rather than after a (nonexistent) previous `}`.
    const emptyArrayPattern = /(\[)(\s*)(\])/;
    const match = raw.match(emptyArrayPattern);
    if (!match) throw new Error("Could not find an empty \"exercises\": [] array to insert into.");
    const insertAt = match.index! + match[1]!.length;
    await writeFile(
      exercisesPath,
      raw.slice(0, insertAt) + newlineStyle + entryText + newlineStyle + raw.slice(insertAt + match[2]!.length),
    );
    return;
  }

  // Matches the last exercise's closing `}`, the array's closing `]`, and the
  // root object's closing `}`, anchored at end of file.
  const closingPattern = /\}(\r?\n)(\s*)\](\r?\n)\}(\r?\n)?$/;
  const match = raw.match(closingPattern);
  if (!match) {
    throw new Error("Could not find the exercises array's closing bracket -- check data/exercises.json's formatting.");
  }

  const insertAt = match.index! + 1; // right after the last exercise's closing `}`
  const updated = `${raw.slice(0, insertAt)},${newlineStyle}${entryText}${raw.slice(insertAt)}`;
  await writeFile(exercisesPath, updated);
}

function runNpmScript(script: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const fullArgs = args.length > 0 ? ["run", script, "--", ...args] : ["run", script];
    const child = spawn(npmCmd, fullArgs, { stdio: "inherit", cwd: repoRoot });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`npm run ${script} exited with code ${code}`))));
    child.on("error", reject);
  });
}

async function main(): Promise<void> {
  console.log("Add a new exercise to data/exercises.json\n");

  // Fired off before the first question, not awaited yet: readline/promises can
  // auto-close its interface if the input stream reaches EOF before any question is
  // pending (https://github.com/nodejs/node/issues/37936) -- harmless for a human
  // typing at a real terminal (stdin never naturally EOFs mid-session), but a real
  // risk for piped/batch input. Asking the first question immediately, before any
  // other awaited work, keeps a question pending as early as possible.
  const dataPromise = Promise.all([
    loadJson<{ exercises: CuratedExercise[] }>(exercisesPath),
    loadJson<Record<string, unknown>>(path.join(repoRoot, "db", "seed-data", "capabilities.json")),
    loadJson<Record<string, unknown>>(path.join(repoRoot, "db", "seed-data", "recovery-classes.json")),
  ]);

  let id: string;
  for (;;) {
    id = await askRequired("Exercise id (e.g. single_leg_calf_raise)");
    if (!/^[0-9a-zA-Z_-]+$/.test(id)) {
      console.log("  Must match ^[0-9a-zA-Z_-]+$");
      continue;
    }
    break;
  }

  const [{ exercises }, capabilities, recoveryClasses] = await dataPromise;
  const capabilityIds = Object.keys(capabilities);
  const recoveryClassIds = Object.keys(recoveryClasses);

  if (exercises.some((e) => e.id === id)) {
    console.error(`"${id}" already exists in data/exercises.json. Rerun and pick a different id.`);
    rl.close();
    process.exitCode = 1;
    return;
  }

  const name = await askRequired("Display name");
  const icon = await ask("Icon (emoji)", "\u{1F3CB}\u{FE0F}");
  const healthIconRaw = await ask("healthIcon path (healthicons.org, e.g. exercise/weights.svg; blank to skip)");
  const movementPattern = await askEnum("Movement pattern", MOVEMENT_PATTERNS);

  const familyId = await askRequired("Family id (groups substitutable variants, e.g. squat_isometric_iso)");
  const sameFamilyMembers = exercises.filter((e) => e.familyId === familyId);
  if (sameFamilyMembers.length > 0) {
    console.log("  Existing members of this family:");
    for (const member of sameFamilyMembers) {
      console.log(`    ${member.id} (progressionLevel ${member.progressionLevel})`);
    }
  }
  const progressionLevel = await askNumber("Progression level (within its family/pattern)", 1);

  const recoveryClass = await askEnum("Recovery class", recoveryClassIds as unknown as readonly string[]);
  const riskLevel = await askEnum("Risk level", RISK_LEVELS);
  const generalWarmthRequired = await askNumber("General warmth required", 0);
  const movementPatternWarmthRequired = await askNumber("Movement-pattern warmth required", 0);
  const fatigueCost = await askNumber("Fatigue cost");
  const warmthEffect = await askNumber("Warmth effect");
  const capabilityEffects = await askCapabilityEffects(capabilityIds);

  const equipment = await askOptionalEnum("Equipment", EQUIPMENT_OPTIONS);
  const force = await askOptionalEnum("Force", FORCE_OPTIONS);
  const level = await askEnum("Level", LEVEL_OPTIONS, "beginner");
  const mechanic = await askOptionalEnum("Mechanic", MECHANIC_OPTIONS);
  const category = await askEnum("Category", CATEGORY_OPTIONS);
  const primaryMuscles = await askMuscleList("Primary muscles");
  const secondaryMuscles = await askMuscleList("Secondary muscles");
  const instructions = await askMultiline("Instructions");
  const safetyNotes = await askMultiline("Safety notes");
  const variantTags = await askList("Variant tags");

  const exercise: CuratedExercise = {
    id,
    baseSource: "custom",
    ...(healthIconRaw ? { healthIcon: healthIconRaw } : {}),
    name,
    icon,
    force,
    level,
    mechanic,
    equipment,
    primaryMuscles,
    secondaryMuscles,
    instructions,
    category,
    images: [],
    movementPattern,
    familyId,
    progressionLevel,
    variantTags,
    safetyNotes,
    generalWarmthRequired,
    movementPatternWarmthRequired,
    riskLevel,
    recoveryClass,
    capabilityEffects,
    fatigueCost,
    warmthEffect,
  };

  console.log("\nNew exercise:");
  console.log(JSON.stringify(exercise, null, 2));

  if (!(await askYesNo("Add this exercise?", true))) {
    console.log("Cancelled -- nothing was written.");
    rl.close();
    return;
  }

  await appendExerciseToFile(exercise, exercises.length);
  console.log(`Added "${id}" to ${path.relative(repoRoot, exercisesPath)}.`);

  if (await askYesNo("Generate an illustration for this exercise now?", true)) {
    try {
      await runNpmScript("generate:images", ["--only", id]);
    } catch (error) {
      console.error(`Image generation failed: ${(error as Error).message}`);
      console.error(`You can retry later with: npm run generate:images -- --only ${id}`);
    }
  }

  if (await askYesNo("Seed the database now (adds this exercise to the running Postgres)?", true)) {
    try {
      await runNpmScript("db:seed", []);
    } catch (error) {
      console.error(`Seeding failed: ${(error as Error).message}`);
      console.error("You can retry later with: npm run db:seed");
    }
  }

  rl.close();
  console.log(`\nDone. "${id}" is ready to use.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
