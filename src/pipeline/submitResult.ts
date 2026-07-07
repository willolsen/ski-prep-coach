/**
 * Submit Result (docs/spec/05-server-api.md#submit-result): append the event to
 * history (docs/spec/07-result-processing.md#store-event) -- the only write. The
 * prescribed dose comes from the pinned recommendation (docs/spec/13-data-layer.md's
 * pending_recommendations.next_action), not from the request body, since the client
 * never sends prescribed values back -- only what actually happened. Resolving
 * clears the pin (docs/spec/13-data-layer.md: "created by GET /next, deleted by
 * POST /result").
 */

import { getPool, type Queryable } from "../db.js";
import { getPendingRecommendation, clearPendingRecommendation } from "../derivations/pendingRecommendation.js";
import { computeDoseRatio, computeCleanCompletion, type Prescribed, type Actual } from "./eventDerivedFields.js";

export interface SubmitResultBody {
  recommendationId: string;
  exerciseId?: string;
  timezone: string;
  startedAt: string;
  completedAt: string;
  actual: Actual;
}

export type SubmitResultOutcome = { ok: true; eventId: string } | { ok: false; status: number; error: string };

interface PinnedNextAction {
  type: "exercise" | "rest";
  exerciseId?: string;
  prescription?: Prescribed | null;
}

export async function submitResult(
  userId: string,
  body: SubmitResultBody,
  pool: Queryable = getPool(),
): Promise<SubmitResultOutcome> {
  // completedAt stands in for "now" here for pending-recommendation expiry checking --
  // there's no separate `now` field on this endpoint (unlike GET /next/Submit Readiness),
  // since startedAt/completedAt already are the explicit timestamps for this write.
  const pending = await getPendingRecommendation(userId, new Date(body.completedAt), pool);
  if (!pending || pending.recommendationId !== body.recommendationId) {
    return { ok: false, status: 409, error: "recommendation not found, already resolved, or expired" };
  }

  const nextAction = pending.nextAction as unknown as PinnedNextAction;
  const isExercise = nextAction.type === "exercise";
  // events.type uses 'exercise_result' | 'rest' (docs/spec/13-data-layer.md), a
  // different vocabulary from nextAction.type's 'exercise' | 'rest'
  // (docs/spec/05-server-api.md#get-next-action).
  const type = isExercise ? "exercise_result" : "rest";
  const exerciseId = isExercise ? (nextAction.exerciseId ?? null) : null;
  const prescribed = isExercise ? (nextAction.prescription ?? null) : null;

  const doseRatio = computeDoseRatio(prescribed, body.actual);
  const cleanCompletion = computeCleanCompletion(prescribed, body.actual);

  const { rows } = await pool.query<{ event_id: string }>(
    `
    INSERT INTO events (
      user_id, type, source, exercise_id, recommendation_id, timezone,
      started_at, completed_at, prescribed, actual, dose_ratio, clean_completion
    )
    VALUES ($1, $2, 'live', $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9, $10, $11)
    RETURNING event_id
    `,
    [
      userId,
      type,
      exerciseId,
      body.recommendationId,
      body.timezone,
      body.startedAt,
      body.completedAt,
      prescribed ? JSON.stringify(prescribed) : null,
      JSON.stringify(body.actual),
      doseRatio,
      cleanCompletion,
    ],
  );

  await clearPendingRecommendation(userId, pool);

  return { ok: true, eventId: rows[0]!.event_id };
}
