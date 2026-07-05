/**
 * Vendors exercise data from https://github.com/yuhonas/free-exercise-db (Unlicense / public domain)
 * into data/free-exercise-db/. See data/free-exercise-db/README.md for details.
 *
 * Usage:
 *   npm run sync:exercises              // schema.json + exercises.json only
 *   npm run sync:exercises -- --with-images   // also downloads all exercise images (~2,500 files)
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_RAW_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main";
const IMAGE_CONCURRENCY = 8;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(scriptDir, "..", "data", "free-exercise-db");
const imagesDir = path.join(dataDir, "images");

interface Exercise {
  id: string;
  images: string[];
  [key: string]: unknown;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  async function runNext(): Promise<void> {
    const index = next++;
    if (index >= items.length) return;
    await worker(items[index]!, index);
    await runNext();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()));
}

async function downloadImages(exercises: Exercise[]): Promise<void> {
  const imagePaths = exercises.flatMap((exercise) => exercise.images);
  console.log(`Downloading ${imagePaths.length} images (concurrency: ${IMAGE_CONCURRENCY})...`);

  let completed = 0;
  await runPool(imagePaths, IMAGE_CONCURRENCY, async (imagePath) => {
    const destPath = path.join(imagesDir, imagePath);
    await mkdir(path.dirname(destPath), { recursive: true });
    const buffer = await fetchBuffer(`${REPO_RAW_BASE}/exercises/${imagePath}`);
    await writeFile(destPath, buffer);
    completed += 1;
    if (completed % 200 === 0 || completed === imagePaths.length) {
      console.log(`  ${completed}/${imagePaths.length} images downloaded`);
    }
  });
}

async function main(): Promise<void> {
  const withImages = process.argv.includes("--with-images");

  await mkdir(dataDir, { recursive: true });

  console.log("Fetching schema.json...");
  const schemaText = await fetchText(`${REPO_RAW_BASE}/schema.json`);
  await writeFile(path.join(dataDir, "schema.json"), schemaText);

  console.log("Fetching exercises.json...");
  const exercisesText = await fetchText(`${REPO_RAW_BASE}/dist/exercises.json`);
  await writeFile(path.join(dataDir, "exercises.json"), exercisesText);

  const exercises = JSON.parse(exercisesText) as Exercise[];
  console.log(`Vendored ${exercises.length} exercises.`);

  if (withImages) {
    await downloadImages(exercises);
  } else {
    console.log("Skipping images (pass --with-images to download them).");
  }

  console.log("Done.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
