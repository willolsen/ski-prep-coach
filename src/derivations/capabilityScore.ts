/**
 * Capability score growth (docs/spec/07-result-processing.md#capability-score-growth),
 * via the recursive fold (docs/spec/13-data-layer.md#deriving-capability-score-the-recursive-fold).
 * Not time-scoped by `now` — unlike fatigue/warmth, capability score isn't decayed, so
 * it just replays every historical event in chronological order.
 */

import type { Pool } from "pg";
import { getPool } from "../db.js";

export interface CapabilityScore {
  score: number;
  lastTrainedAt: string | null;
}

export async function getCapabilityScores(
  userId: string,
  pool: Pool = getPool(),
): Promise<Record<string, CapabilityScore>> {
  const [foldResult, lastTrainedResult, capabilitiesResult] = await Promise.all([
    pool.query<{ capability_id: string; score: number }>(
      `
      WITH RECURSIVE stimulus AS (
        SELECT
          e.user_id, e.completed_at, ce.key AS capability_id,
          (ce.value::numeric) * e.dose_ratio * (e.clean_completion::int) AS stimulus_earned
        FROM events e
        JOIN exercises x ON x.exercise_id = e.exercise_id
        CROSS JOIN LATERAL jsonb_each_text(x.capability_effects) AS ce(key, value)
        WHERE e.type = 'exercise_result' AND e.user_id = $1
      ),
      fold AS (
        (
          SELECT DISTINCT ON (capability_id)
            capability_id, completed_at,
            stimulus_earned * 0.1 * (1 - 0::numeric / c.target) AS running_score
          FROM stimulus s JOIN capabilities c USING (capability_id)
          ORDER BY capability_id, completed_at ASC
        )

        UNION ALL

        SELECT nxt.capability_id, nxt.completed_at, fold.running_score + nxt.increment
        FROM fold
        JOIN LATERAL (
          SELECT s.capability_id, s.completed_at,
            s.stimulus_earned * 0.1 * (1 - fold.running_score / c.target) AS increment
          FROM stimulus s JOIN capabilities c USING (capability_id)
          WHERE s.capability_id = fold.capability_id AND s.completed_at > fold.completed_at
          ORDER BY s.completed_at ASC
          LIMIT 1
        ) nxt ON true
      )
      SELECT DISTINCT ON (capability_id) capability_id, running_score AS score
      FROM fold
      ORDER BY capability_id, completed_at DESC;
      `,
      [userId],
    ),
    pool.query<{ capability_id: string; last_trained_at: string }>(
      `
      SELECT ce.key AS capability_id, MAX(e.completed_at) AS last_trained_at
      FROM events e
      JOIN exercises x ON x.exercise_id = e.exercise_id
      CROSS JOIN LATERAL jsonb_each_text(x.capability_effects) AS ce(key, value)
      WHERE e.type = 'exercise_result' AND e.user_id = $1
      GROUP BY ce.key
      `,
      [userId],
    ),
    pool.query<{ capability_id: string }>(`SELECT capability_id FROM capabilities`),
  ]);

  const scoreById = new Map(foldResult.rows.map((r) => [r.capability_id, r.score]));
  const lastTrainedById = new Map(lastTrainedResult.rows.map((r) => [r.capability_id, r.last_trained_at]));

  const result: Record<string, CapabilityScore> = {};
  for (const { capability_id } of capabilitiesResult.rows) {
    result[capability_id] = {
      score: scoreById.get(capability_id) ?? 0,
      lastTrainedAt: lastTrainedById.get(capability_id) ?? null,
    };
  }
  return result;
}
