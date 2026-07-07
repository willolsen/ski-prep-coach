/**
 * dose_ratio and clean_completion (docs/spec/13-data-layer.md#the-event-log-readiness-and-pending-recommendations):
 * computed once, application-side, at write time -- pure functions of that same
 * event's own prescribed/actual fields, never of other rows, so they can't drift out
 * of sync with anything.
 */

export interface Prescribed {
  sets?: number;
  durationSec?: number;
  reps?: number;
  restSec?: number;
  targetRpe?: number;
  painLimit?: number;
}

export interface Actual {
  setsCompleted?: number;
  durationSecCompleted?: number;
  reps?: number;
  maxPain?: number;
  rpe?: number;
  difficulty?: "too_easy" | "easy" | "normal" | "hard" | "too_hard";
  notes?: string;
}

/**
 * Actual dose over prescribed dose (docs/spec/07-result-processing.md#capability-score-growth),
 * capped at 1.0 so exceeding the prescription doesn't over-reward; falls back to 1.0
 * with no prescription to compare against
 * (docs/spec/05-server-api.md#logging-without-a-recommendation).
 */
export function computeDoseRatio(prescribed: Prescribed | null, actual: Actual): number {
  if (!prescribed) return 1.0;

  if (typeof prescribed.durationSec === "number" && typeof actual.durationSecCompleted === "number") {
    return Math.max(0, Math.min(1, actual.durationSecCompleted / prescribed.durationSec));
  }
  if (typeof prescribed.reps === "number" && typeof actual.reps === "number") {
    return Math.max(0, Math.min(1, actual.reps / prescribed.reps));
  }
  if (typeof prescribed.sets === "number" && typeof actual.setsCompleted === "number") {
    return Math.max(0, Math.min(1, actual.setsCompleted / prescribed.sets));
  }
  return 1.0;
}

/**
 * Per docs/spec/07-result-processing.md#capability-score-growth's skip conditions:
 * pain exceeded painLimit, difficulty was too_hard, or rpe reached targetRpe + 3.
 * "Stopped early due to discomfort" has no dedicated schema field (the same
 * documented gap as Pain Risk's identical phrase), so it isn't checked here.
 */
export function computeCleanCompletion(prescribed: Prescribed | null, actual: Actual): boolean {
  const painExceeded = prescribed?.painLimit !== undefined && (actual.maxPain ?? 0) > prescribed.painLimit;
  const tooHard = actual.difficulty === "too_hard";
  const rpeTooHigh =
    prescribed?.targetRpe !== undefined && actual.rpe !== undefined && actual.rpe >= prescribed.targetRpe + 3;

  return !(painExceeded || tooHard || rpeTooHigh);
}
