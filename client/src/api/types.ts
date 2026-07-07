/**
 * Mirrors docs/spec/05-server-api.md exactly. Keep in sync with the spec, not
 * with whatever the mock server happens to return — the mock is a stand-in for
 * a server that implements this same contract.
 */

export type ActionType = "exercise" | "rest";

export interface Tempo {
  downSec: number;
  pauseSec: number;
  upSec: number;
}

export interface Prescription {
  sets?: number;
  reps?: number;
  durationSec?: number;
  tempo?: Tempo;
  restSec?: number;
  targetRpe: number;
  painLimit: number;
}

export interface NextAction {
  type: ActionType;
  recommendationId: string;
  exerciseId?: string;
  title: string;
  icon?: string;
  prescription?: Prescription;
  estimatedDurationSec: number | null;
  instructions: string[];
  completionQuestions: string[];
  why: string[];
}

export type ReadinessLevel = "green" | "yellow" | "red";
export type WarmthLevel = "cold" | "slightly_warm" | "warm" | "very_warm";

export interface TodayProgress {
  status: "in_progress" | "complete";
  stimulusScore: number;
  targetStimulusScore: number;
  percentComplete: number;
}

export interface StateSummary {
  readiness: ReadinessLevel;
  warmth: WarmthLevel;
  limitingCapabilities: string[];
}

export interface NextActionResponse {
  nextAction: NextAction;
  todayProgress: TodayProgress;
  stateSummary?: StateSummary;
}

export type Difficulty = "too_easy" | "easy" | "normal" | "hard" | "too_hard";

export interface ActualResult {
  setsCompleted?: number;
  repsCompleted?: number;
  durationSecCompleted?: number;
  load?: string;
  maxPain: number;
  rpe: number;
  difficulty: Difficulty;
  notes?: string;
}

export interface SubmitResultRequest {
  recommendationId: string;
  exerciseId?: string;
  timezone: string;
  startedAt: string;
  completedAt: string;
  actual: ActualResult;
}

export interface SubmitResultResponse {
  status: "ok";
  eventId: string;
}
