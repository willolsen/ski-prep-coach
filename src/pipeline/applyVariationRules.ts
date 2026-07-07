/**
 * Apply Variation Rules (docs/spec/06-decision-pipeline.md#apply-variation-rules):
 * given the top-scored candidate, decide whether to actually recommend it or swap it
 * for a computed regression/progression. Checked in order -- the first rule that
 * matches wins, since risk and readiness/warmth safety concerns should take priority
 * over a progression opportunity.
 *
 * Two of this section's rules reference conditions with no concrete threshold in the
 * spec ("readiness or warmth is low", "recent results justify progression") -- chosen
 * and documented here as reasonable, tunable interpretations:
 *   - "low readiness": today's computedStatus is "yellow" (red would already have
 *     triggered the safety veto before reaching this step)
 *   - "low warmth": the candidate's own warmth margin is thin -- general or pattern
 *     warmth is below WARMTH_MARGIN_MULTIPLIER times its own required threshold. It
 *     already passed the hard >= threshold gate in Generate Candidate Actions, so "low"
 *     here means "barely enough," not "insufficient"
 *   - "recent results justify progression": the exercise's own most recent event
 *     reported low pain and comfortable effort (difficulty easy/too_easy, maxPain <= 1)
 */

import { getPool, type Queryable } from "../db.js";
import { getRegression, getProgression, type Exercise } from "../derivations/variation.js";
import { getWarmth } from "../derivations/fatigueWarmth.js";
import { getTodayReadiness } from "../derivations/readiness.js";
import { getPainRisk } from "../derivations/recovery.js";

const WARMTH_MARGIN_MULTIPLIER = 1.25;

export interface VariationSelection {
  exerciseId: string;
  reason: string;
}

export async function applyVariationRules(
  userId: string,
  timezone: string,
  now: Date,
  topCandidate: Exercise,
  pool: Queryable = getPool(),
): Promise<VariationSelection> {
  const regression = await getRegression(topCandidate.exerciseId, pool);

  const painRiskIds = regression ? [topCandidate.exerciseId, regression.exerciseId] : [topCandidate.exerciseId];
  const painRisk = await getPainRisk(userId, painRiskIds, pool);
  if (painRisk.elevatedRisk && regression) {
    return { exerciseId: regression.exerciseId, reason: "elevated_risk_use_regression" };
  }

  const readiness = await getTodayReadiness(userId, timezone, now, pool);
  if (readiness?.computedStatus === "yellow" && regression) {
    return { exerciseId: regression.exerciseId, reason: "low_readiness_use_regression" };
  }

  const warmth = await getWarmth(userId, now, pool);
  const patternWarmth =
    warmth.byMovementPattern[topCandidate.movementPattern as keyof typeof warmth.byMovementPattern] ?? 0;
  const generalMarginLow = warmth.general < topCandidate.generalWarmthRequired * WARMTH_MARGIN_MULTIPLIER;
  const patternMarginLow = patternWarmth < topCandidate.movementPatternWarmthRequired * WARMTH_MARGIN_MULTIPLIER;
  if ((generalMarginLow || patternMarginLow) && regression) {
    return { exerciseId: regression.exerciseId, reason: "low_warmth_use_regression" };
  }

  if (await didRecentResultsJustifyProgression(userId, topCandidate.exerciseId, pool)) {
    const progression = await getProgression(topCandidate.exerciseId, pool);
    if (progression) {
      return { exerciseId: progression.exerciseId, reason: "recent_results_justify_progression" };
    }
  }

  return { exerciseId: topCandidate.exerciseId, reason: "no_variation_needed" };
}

async function didRecentResultsJustifyProgression(
  userId: string,
  exerciseId: string,
  pool: Queryable,
): Promise<boolean> {
  const { rows } = await pool.query<{ actual: { difficulty?: string; maxPain?: number } }>(
    `
    SELECT actual FROM events
    WHERE user_id = $1 AND exercise_id = $2 AND type = 'exercise_result'
    ORDER BY completed_at DESC
    LIMIT 1
    `,
    [userId, exerciseId],
  );

  const mostRecent = rows[0];
  if (!mostRecent) return false;

  const difficulty = mostRecent.actual.difficulty;
  const maxPain = mostRecent.actual.maxPain ?? 0;
  return (difficulty === "easy" || difficulty === "too_easy") && maxPain <= 1;
}
