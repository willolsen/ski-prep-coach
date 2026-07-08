/**
 * Client-side stand-in for "what did I do last time" per exercise. In the real
 * system this would be derived from the event log (docs/spec/04-history-and-readiness.md)
 * server-side, but the spec's API contract (docs/spec/05-server-api.md) has no
 * endpoint for querying per-exercise history — GET /next only ever returns the
 * single next recommendation. Rather than invent a new server endpoint the real
 * backend isn't obligated to match, this stays a local prototype convenience:
 * a plain localStorage cache, keyed by exerciseId, updated as sets are logged.
 */

const STORAGE_PREFIX = "skiprepcoach:lastSet:";

export interface LastSet {
  weight: string;
  reps: number;
}

export function getLastSet(exerciseId: string): LastSet | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + exerciseId);
    return raw ? (JSON.parse(raw) as LastSet) : undefined;
  } catch {
    return undefined;
  }
}

export function saveLastSet(exerciseId: string, lastSet: LastSet): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + exerciseId, JSON.stringify(lastSet));
  } catch {
    // best-effort only; losing the "last time" prefill isn't worth breaking the flow over
  }
}
