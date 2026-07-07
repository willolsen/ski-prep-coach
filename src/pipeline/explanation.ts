/**
 * Build Explanation (docs/spec/06-decision-pipeline.md#build-explanation): assembles
 * the user-facing title/instructions/completionQuestions/why[] from the exercise's
 * own metadata and the reason codes collected earlier in the pipeline -- a
 * deterministic reason-code-to-template lookup, per the spec's own instruction ("use
 * deterministic reason codes and message templates"), not narrative prose generation.
 * The spec's own why[] example reads more like hand-written prose than a template
 * lookup could produce; this is a reasonable, simpler mechanical approximation of it.
 */

import type { Exercise } from "../derivations/variation.js";

const COMPLETION_QUESTIONS = [
  "How many sets did you complete?",
  "What was the highest pain level?",
  "What was the effort level, 1-10?",
  "Anything unusual?",
];

const REASON_MESSAGES: Record<string, string> = {
  trains_limiting_capability: "This trains a capability that's currently a high priority.",
  liked_activity: "This is an activity you enjoy.",
  low_current_fatigue: "Recent fatigue in this area is low.",
  no_repetition_penalty: "You haven't done this recently.",
  elevated_risk_use_regression: "A lighter variation was chosen because recent pain was elevated on the original exercise.",
  low_readiness_use_regression: "A lighter variation was chosen because today's readiness is lower than usual.",
  low_warmth_use_regression: "A lighter variation was chosen since you're not yet fully warmed up for this movement.",
  recent_results_justify_progression: "A more advanced variation was chosen because recent results were easy and low-pain.",
  safety_red_day: "Today's readiness is flagged red.",
  pain_too_high: "Reported pain is too high right now.",
  swelling_reported: "Swelling was reported.",
  limp_or_instability: "Stairs or mobility difficulty was reported.",
  unsafe_fatigue_accumulation: "Fatigue has accumulated to an unsafe level.",
  enough_stimulus_today: "You have already reached today's useful training stimulus.",
  no_eligible_candidates: "No exercise is currently eligible.",
};

function reasonCodesToWhy(reasonCodes: string[]): string[] {
  const messages = reasonCodes.map((code) => REASON_MESSAGES[code] ?? code);
  return [...new Set(messages)];
}

export interface Explanation {
  title: string;
  icon?: string;
  instructions: string[];
  completionQuestions: string[];
  why: string[];
}

export function buildExerciseExplanation(exercise: Exercise, reasonCodes: string[]): Explanation {
  return {
    title: String(exercise.metadata.name ?? exercise.exerciseId),
    icon: exercise.metadata.icon as string | undefined,
    instructions: (exercise.metadata.instructions as string[] | undefined) ?? [],
    completionQuestions: COMPLETION_QUESTIONS,
    why: reasonCodesToWhy(reasonCodes),
  };
}

export function buildRestExplanation(reasonCodes: string[]): Explanation {
  return {
    title: "Rest Is the Best Next Action",
    instructions: [
      "No more training is recommended right now.",
      "Normal walking and daily activity are fine.",
      "Resume when the app recommends another action.",
    ],
    completionQuestions: [],
    why: reasonCodesToWhy(reasonCodes),
  };
}
