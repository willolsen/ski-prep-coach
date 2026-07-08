import type { HistoryResponse, NextActionResponse, SubmitResultRequest, SubmitResultResponse } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export function currentTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Not part of the spec's API contract (docs/spec/05-server-api.md has no image
 * field on nextAction) — derived client-side from `exerciseId`, which the
 * contract does provide. Both the mock (scripts/mock-server.ts) and the real
 * server (src/app.ts) serve images at this same path; this is the one place to
 * point elsewhere (e.g. a CDN) if that ever changes.
 */
export function exerciseImageUrl(exerciseId: string): string {
  return `${API_BASE_URL}/exercise-images/${encodeURIComponent(exerciseId)}.png`;
}

export async function getNextAction(userId: string, now: Date): Promise<NextActionResponse> {
  const params = new URLSearchParams({
    timezone: currentTimezone(),
    now: now.toISOString(),
  });
  const res = await fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(userId)}/next?${params}`);
  if (!res.ok) {
    throw new Error(`GET /next failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<NextActionResponse>;
}

export async function getHistory(userId: string, limit = 50): Promise<HistoryResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(userId)}/history?${params}`);
  if (!res.ok) {
    throw new Error(`GET /history failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<HistoryResponse>;
}

export async function submitResult(userId: string, body: SubmitResultRequest): Promise<SubmitResultResponse> {
  const res = await fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(userId)}/results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST /results failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<SubmitResultResponse>;
}
