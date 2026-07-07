/**
 * Generates a consistent-style illustration for each exercise in data/exercises.json
 * using Google's nano-banana-2 image model on Replicate, so every exercise gets a
 * purpose-made, pose-accurate image in one unified visual style instead of a mix of
 * stock photos and generic pictograms.
 *
 * Images are saved to data/generated-images/<exerciseId>.png (gitignored — regenerate
 * on demand rather than committing binaries).
 *
 * Requires REPLICATE_API_TOKEN in .env.
 *
 * Usage:
 *   npm run generate:images                          // all exercises missing an image
 *   npm run generate:images -- --only wall_sit,pushup // just these ids (pilot runs)
 *   npm run generate:images -- --force                // regenerate even if a file already exists
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
if (!REPLICATE_TOKEN) {
  throw new Error("REPLICATE_API_TOKEN is not set. Add it to .env (see .env.example).");
}

const MODEL = "google/nano-banana-2";
const CONCURRENCY = 4;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const dataDir = path.join(repoRoot, "data");
const outDir = path.join(dataDir, "generated-images");

interface CuratedExercise {
  id: string;
  name?: string;
  instructions?: string[];
  movementPattern?: string;
  category?: string;
}

const STYLE_SUFFIX =
  "Flat vector illustration, instructional diagram style like a physical therapy handout. " +
  "Clean simple line work, a single muted blue-gray color palette, plain white background, " +
  "one human figure shown from the side or three-quarter angle clearly demonstrating the body " +
  "position, no text, no labels, no logos, no watermark, centered composition.";

function buildPrompt(exercise: CuratedExercise): string {
  const keyStep = exercise.instructions?.[0] ?? "";
  const pattern = exercise.movementPattern ? ` (${exercise.movementPattern} movement pattern)` : "";
  return (
    `Instructional fitness illustration of a person performing "${exercise.name}"${pattern}. ` +
    `Key body position: ${keyStep} ${STYLE_SUFFIX}`
  );
}

interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string;
  error?: string | null;
  urls: { get: string };
}

async function pollUntilDone(prediction: Prediction): Promise<Prediction> {
  let current = prediction;
  while (current.status === "starting" || current.status === "processing") {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const res = await fetch(current.urls.get, {
      headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
    });
    current = (await res.json()) as Prediction;
  }
  return current;
}

async function generateImageBuffer(prompt: string): Promise<Buffer> {
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REPLICATE_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({
      input: {
        prompt,
        aspect_ratio: "1:1",
        resolution: "1K",
        output_format: "png",
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Replicate request failed: ${res.status} ${await res.text()}`);
  }

  const prediction = await pollUntilDone((await res.json()) as Prediction);

  if (prediction.status !== "succeeded" || !prediction.output) {
    throw new Error(`Prediction ${prediction.id} did not succeed: ${prediction.error ?? prediction.status}`);
  }

  const imageRes = await fetch(prediction.output);
  if (!imageRes.ok) {
    throw new Error(`Failed to download generated image: ${imageRes.status}`);
  }
  return Buffer.from(await imageRes.arrayBuffer());
}

async function main(): Promise<void> {
  const onlyFlagIndex = process.argv.indexOf("--only");
  const onlyIds = onlyFlagIndex !== -1 ? process.argv[onlyFlagIndex + 1]?.split(",") : null;

  const text = await readFile(path.join(dataDir, "exercises.json"), "utf-8");
  const { exercises } = JSON.parse(text) as { exercises: CuratedExercise[] };
  const targets = onlyIds ? exercises.filter((e) => onlyIds.includes(e.id)) : exercises;

  if (onlyIds) {
    const missing = onlyIds.filter((id) => !targets.some((e) => e.id === id));
    if (missing.length > 0) {
      console.warn(`Warning: no exercise found for ids: ${missing.join(", ")}`);
    }
  }

  console.log(`Generating ${targets.length} image(s) via ${MODEL} (concurrency: ${CONCURRENCY})...`);
  await mkdir(outDir, { recursive: true });

  const queue = [...targets];
  let completed = 0;
  let failed = 0;

  const force = process.argv.includes("--force");
  let skipped = 0;

  async function alreadyExists(exerciseId: string): Promise<boolean> {
    if (force) return false;
    try {
      await access(path.join(outDir, `${exerciseId}.png`));
      return true;
    } catch {
      return false;
    }
  }

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const exercise = queue.shift();
      if (!exercise) return;

      if (await alreadyExists(exercise.id)) {
        skipped++;
        console.log(`  [skip] ${exercise.id} already generated (use --force to regenerate)`);
        continue;
      }

      const prompt = buildPrompt(exercise);
      try {
        const buffer = await generateImageBuffer(prompt);
        await writeFile(path.join(outDir, `${exercise.id}.png`), buffer);
        completed++;
        console.log(`  [${completed + failed}/${targets.length}] done: ${exercise.id}`);
      } catch (error) {
        failed++;
        console.error(`  [${completed + failed}/${targets.length}] FAILED: ${exercise.id} — ${(error as Error).message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()));

  console.log(
    `Done. ${completed} succeeded, ${failed} failed, ${skipped} skipped (already existed). Images in ${path.relative(repoRoot, outDir)}/`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
