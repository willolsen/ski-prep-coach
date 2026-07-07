/**
 * Determine Whether Enough Has Been Done Today
 * (docs/spec/06-decision-pipeline.md#determine-whether-enough-has-been-done-today).
 *
 * This priority-weighted stimulusScore is a genuinely different number from Daily
 * Progress's currentStimulusScore (docs/spec/07-result-processing.md#daily-progress,
 * docs/spec/08-daily-progress.md) -- the spec's own worked examples for these two
 * sections don't reconcile under either a purely-weighted or purely-raw reading of
 * the other, so they're treated here as two separate metrics: this weighted one
 * drives the internal "enough for today" gate; the raw sum from getDailyProgress is
 * what's shown to the user in the API response's todayProgress.
 *
 * The full rule is "stimulusScore >= target AND no remaining candidate offers
 * meaningful benefit without excessive fatigue cost" -- the second half references
 * candidate scoring, which hasn't run yet at this point in the pipeline. This module
 * only computes the first half; the full rest-vs-continue decision is finalized by
 * the orchestrator after scoring (a non-positive top score is treated as "no
 * meaningful benefit," since fatigue cost is already one of the score's own terms).
 */

import { getPool, type Queryable } from "../db.js";
import { getDailyProgress } from "../derivations/recovery.js";
import { getCapabilityPriorities } from "../derivations/capabilityScore.js";

export const DAILY_STIMULUS_TARGET = 70;

export async function getWeightedStimulusScore(
  userId: string,
  timezone: string,
  now: Date,
  pool: Queryable = getPool(),
): Promise<number> {
  const dailyProgress = await getDailyProgress(userId, timezone, now, pool);
  const priorities = await getCapabilityPriorities(pool);

  let stimulusScore = 0;
  for (const [capabilityId, stimulus] of Object.entries(dailyProgress.capabilityStimulus)) {
    const priority = priorities[capabilityId] ?? 0;
    stimulusScore += stimulus * (priority / 10);
  }
  return stimulusScore;
}

export async function hasEnoughStimulusToday(
  userId: string,
  timezone: string,
  now: Date,
  pool: Queryable = getPool(),
): Promise<boolean> {
  const stimulusScore = await getWeightedStimulusScore(userId, timezone, now, pool);
  return stimulusScore >= DAILY_STIMULUS_TARGET;
}
