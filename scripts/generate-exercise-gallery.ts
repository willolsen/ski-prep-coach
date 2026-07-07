/**
 * Builds a single self-contained HTML page listing every exercise in the curated
 * data/exercises.json set. Preferred image source, in order:
 *   1. An AI-generated illustration from data/generated-images/<id>.png (see
 *      `npm run generate:images`) — one consistent style across all 50.
 *   2. A real photo fetched from the vendored data/free-exercise-db/exercises.json
 *      image set (Unlicense/public domain), for exercises with an `imageSourceId`.
 *   3. A `healthIcon` pictogram fetched from healthicons.org (CC0).
 * Cases 2 and 3 are fallbacks for when generated images haven't been produced yet;
 * with the full set generated, every card uses case 1. Everything is inlined as a
 * data URI so the output has no external dependencies.
 *
 * Usage:
 *   npm run gallery:exercises
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_RAW_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main";
const HEALTHICONS_RAW_BASE =
  "https://raw.githubusercontent.com/resolvetosavelives/healthicons/main/public/icons/svg/filled";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const dataDir = path.join(repoRoot, "data");
const generatedImagesDir = path.join(dataDir, "generated-images");
const outDir = path.join(repoRoot, "dist");
const outFile = path.join(outDir, "exercise-gallery.html");

interface CuratedExercise {
  id: string;
  baseSource: "custom" | "free-exercise-db";
  imageSourceId?: string;
  healthIcon?: string;
  name?: string;
  icon?: string;
  instructions?: string[];
  category?: string;
  equipment?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  images?: string[];
}

interface UpstreamExercise {
  id: string;
  name: string;
  instructions: string[];
  category: string;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  images: string[];
}

interface ResolvedExercise {
  id: string;
  baseSource: "custom" | "free-exercise-db";
  name: string;
  icon: string;
  instructions: string[];
  category?: string;
  equipment?: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  imagePaths: string[];
  imageSourceId?: string;
  healthIcon?: string;
}

const ICON_BACKGROUNDS = ["#2563eb", "#0d9488", "#7c3aed", "#dc2626", "#d97706", "#059669"];
const healthIconCache = new Map<string, string>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

async function loadCurated(): Promise<CuratedExercise[]> {
  const text = await readFile(path.join(dataDir, "exercises.json"), "utf-8");
  const parsed = JSON.parse(text) as { exercises: CuratedExercise[] };
  return parsed.exercises;
}

async function loadUpstreamById(): Promise<Map<string, UpstreamExercise>> {
  const text = await readFile(path.join(dataDir, "free-exercise-db", "exercises.json"), "utf-8");
  const parsed = JSON.parse(text) as UpstreamExercise[];
  return new Map(parsed.map((exercise) => [exercise.id, exercise]));
}

function resolve(curated: CuratedExercise[], upstreamById: Map<string, UpstreamExercise>): ResolvedExercise[] {
  return curated.map((entry) => {
    if (entry.baseSource === "custom") {
      const upstreamForImage = entry.imageSourceId ? upstreamById.get(entry.imageSourceId) : undefined;
      if (entry.imageSourceId && !upstreamForImage) {
        throw new Error(`imageSourceId "${entry.imageSourceId}" for "${entry.id}" not found in free-exercise-db`);
      }
      return {
        id: entry.id,
        baseSource: "custom",
        name: entry.name ?? entry.id,
        icon: entry.icon ?? "🏔️",
        instructions: entry.instructions ?? [],
        category: entry.category,
        equipment: entry.equipment,
        primaryMuscles: entry.primaryMuscles ?? [],
        secondaryMuscles: entry.secondaryMuscles ?? [],
        imagePaths: upstreamForImage?.images ?? entry.images ?? [],
        imageSourceId: entry.imageSourceId,
        healthIcon: entry.healthIcon,
      };
    }

    const upstream = upstreamById.get(entry.id);
    if (!upstream) {
      throw new Error(`No free-exercise-db entry found for id "${entry.id}" (check data/exercises.json)`);
    }
    return {
      id: upstream.id,
      baseSource: "free-exercise-db",
      name: upstream.name,
      icon: entry.icon ?? "🏔️",
      instructions: upstream.instructions,
      category: upstream.category,
      equipment: upstream.equipment,
      primaryMuscles: upstream.primaryMuscles,
      secondaryMuscles: upstream.secondaryMuscles,
      imagePaths: upstream.images,
    };
  });
}

async function fetchImageAsDataUri(imagePath: string): Promise<string> {
  const res = await fetch(`${REPO_RAW_BASE}/exercises/${imagePath}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch image ${imagePath}: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function fetchHealthIconGlyph(healthIcon: string): Promise<string> {
  const cached = healthIconCache.get(healthIcon);
  if (cached) return cached;

  const res = await fetch(`${HEALTHICONS_RAW_BASE}/${healthIcon}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch healthicon ${healthIcon}: ${res.status} ${res.statusText}`);
  }
  const raw = await res.text();
  // healthicons paths use fill="currentColor"; pin to white since we embed as a
  // standalone <img> data URI (no surrounding CSS color context to inherit).
  const glyphInner = raw
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/currentColor/g, "#ffffff");
  healthIconCache.set(healthIcon, glyphInner);
  return glyphInner;
}

async function healthIconIllustrationDataUri(exercise: ResolvedExercise): Promise<string> {
  const background = ICON_BACKGROUNDS[hashString(exercise.id) % ICON_BACKGROUNDS.length];
  const glyph = await fetchHealthIconGlyph(exercise.healthIcon!);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
    <rect width="220" height="220" rx="16" fill="${background}"/>
    <g transform="translate(37, 37) scale(3)">${glyph}</g>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

type ImageKind = "ai" | "photo" | "illustration";

interface ImageResult {
  srcs: string[];
  kind: ImageKind;
}

async function generatedImageDataUri(exerciseId: string): Promise<string | undefined> {
  const filePath = path.join(generatedImagesDir, `${exerciseId}.png`);
  try {
    await access(filePath);
  } catch {
    return undefined;
  }
  const buffer = await readFile(filePath);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function withImages(exercises: ResolvedExercise[]): Promise<Map<string, ImageResult>> {
  const result = new Map<string, ImageResult>();
  for (const exercise of exercises) {
    const generated = await generatedImageDataUri(exercise.id);
    if (generated) {
      result.set(exercise.id, { srcs: [generated], kind: "ai" });
      continue;
    }

    if (exercise.imagePaths.length === 0) {
      if (!exercise.healthIcon) {
        throw new Error(`"${exercise.id}" has no generated image, imageSourceId, or healthIcon`);
      }
      console.log(`Rendering healthicons illustration for ${exercise.id} (icon: ${exercise.healthIcon})...`);
      result.set(exercise.id, { srcs: [await healthIconIllustrationDataUri(exercise)], kind: "illustration" });
      continue;
    }
    const label = exercise.imageSourceId ?? exercise.id;
    console.log(`Fetching ${exercise.imagePaths.length} image(s) for ${exercise.id} (source: ${label})...`);
    const dataUris = await Promise.all(exercise.imagePaths.map(fetchImageAsDataUri));
    result.set(exercise.id, { srcs: dataUris, kind: "photo" });
  }
  return result;
}

const KIND_LABEL: Record<ImageKind, string> = { ai: "AI illustration", photo: "photo", illustration: "illustration" };

function renderCard(exercise: ResolvedExercise, images: ImageResult): string {
  const imagesHtml = `<div class="images">${images.srcs
    .map((src) => `<img src="${src}" alt="${escapeHtml(exercise.name)}" loading="lazy">`)
    .join("")}<span class="badge badge--${images.kind}">${KIND_LABEL[images.kind]}</span></div>`;

  const instructionsHtml =
    exercise.instructions.length > 0
      ? `<ol class="instructions">${exercise.instructions.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`
      : "";

  return `
    <article class="card">
      <h2>${escapeHtml(exercise.name)}</h2>
      <div class="meta">
        ${exercise.category ? `<span class="badge">${escapeHtml(exercise.category)}</span>` : ""}
        ${exercise.equipment ? `<span class="badge">${escapeHtml(exercise.equipment)}</span>` : ""}
      </div>
      ${imagesHtml}
      ${instructionsHtml}
    </article>`;
}

function renderPage(cards: string[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SkiPrepCoach — Exercise Gallery</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
    line-height: 1.5;
  }
  h1 { margin-bottom: 0.25rem; }
  .subtitle { color: #666; margin-top: 0; }
  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
    margin-top: 2rem;
  }
  .card {
    border: 1px solid rgba(128, 128, 128, 0.35);
    border-radius: 10px;
    padding: 1.25rem 1.5rem;
  }
  .card h2 { margin-top: 0; }
  .meta { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
  .badge {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    background: rgba(128, 128, 128, 0.18);
  }
  .badge--ai { background: #dbeafe; color: #1e3a8a; }
  .badge--photo { background: #d1e7dd; color: #0f5132; }
  .badge--illustration { background: #fff3cd; color: #664d03; }
  @media (prefers-color-scheme: dark) {
    .subtitle { color: #aaa; }
    .badge--ai { background: #1e3a8a; color: #dbeafe; }
    .badge--photo { background: #14532d; color: #d1fae5; }
    .badge--illustration { background: #5c4813; color: #fef3c7; }
  }
  .images { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
  .images img { max-width: 220px; border-radius: 6px; }
  .instructions { margin: 0; padding-left: 1.25rem; }
  .instructions li { margin-bottom: 0.35rem; }
</style>
</head>
<body>
<h1>SkiPrepCoach — Exercise Gallery</h1>
<p class="subtitle">The curated MVP exercise set from <code>data/exercises.json</code>. "AI illustration" cards are generated per-exercise via <a href="https://replicate.com/google/nano-banana-2">google/nano-banana-2</a> for one consistent style across the whole set; "photo" and "illustration" cards are fallbacks (free-exercise-db / healthicons.org) used only when a generated image is missing.</p>
<div class="grid">
${cards.join("\n")}
</div>
</body>
</html>
`;
}

async function main(): Promise<void> {
  const [curated, upstreamById] = await Promise.all([loadCurated(), loadUpstreamById()]);
  const resolved = resolve(curated, upstreamById);
  const imagesByExerciseId = await withImages(resolved);

  const cards = resolved.map((exercise) =>
    renderCard(exercise, imagesByExerciseId.get(exercise.id) ?? { srcs: [], kind: "illustration" }),
  );

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, renderPage(cards));

  const counts = { ai: 0, photo: 0, illustration: 0 };
  for (const result of imagesByExerciseId.values()) counts[result.kind]++;
  console.log(
    `Wrote ${resolved.length} exercises to ${path.relative(repoRoot, outFile)} ` +
      `(${counts.ai} AI illustrations, ${counts.photo} photos, ${counts.illustration} healthicons fallbacks)`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
