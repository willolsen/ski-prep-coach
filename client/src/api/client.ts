import type { NextActionResponse, SubmitResultRequest, SubmitResultResponse } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export function currentTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export async function getNextAction(userId: string): Promise<NextActionResponse> {
  const params = new URLSearchParams({
    timezone: currentTimezone(),
    now: new Date().toISOString(),
  });
  const res = await fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(userId)}/next?${params}`);
  if (!res.ok) {
    throw new Error(`GET /next failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<NextActionResponse>;
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
