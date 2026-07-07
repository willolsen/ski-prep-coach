/**
 * Pending recommendations (docs/spec/13-data-layer.md#what-s-actually-stored's one
 * deliberate exception to derive-don't-store): the recommendationId pinning behavior
 * (docs/spec/05-server-api.md#get-next-action) genuinely can't be derived from
 * history, since it describes something that hasn't happened yet. One row per user;
 * created by GET /next, deleted by POST /result, expires after 4 hours checked
 * against the request's `now`, never the database's own clock.
 */

import { getPool, type Queryable } from "../db.js";

const PENDING_RECOMMENDATION_TIMEOUT_HOURS = 4;

export interface PendingRecommendation {
  recommendationId: string;
  nextAction: Record<string, unknown>;
}

export async function getPendingRecommendation(
  userId: string,
  now: Date,
  pool: Queryable = getPool(),
): Promise<PendingRecommendation | null> {
  const { rows } = await pool.query<{ recommendation_id: string; next_action: Record<string, unknown>; expires_at: string }>(
    `SELECT recommendation_id, next_action, expires_at FROM pending_recommendations WHERE user_id = $1`,
    [userId],
  );

  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= now.getTime()) return null;

  return { recommendationId: row.recommendation_id, nextAction: row.next_action };
}

export async function setPendingRecommendation(
  userId: string,
  recommendationId: string,
  nextAction: Record<string, unknown>,
  now: Date,
  pool: Queryable = getPool(),
): Promise<void> {
  const expiresAt = new Date(now.getTime() + PENDING_RECOMMENDATION_TIMEOUT_HOURS * 3_600_000);

  await pool.query(
    `
    INSERT INTO pending_recommendations (recommendation_id, user_id, next_action, expires_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id) DO UPDATE
      SET recommendation_id = EXCLUDED.recommendation_id,
          next_action = EXCLUDED.next_action,
          expires_at = EXCLUDED.expires_at,
          created_at = now()
    `,
    [recommendationId, userId, JSON.stringify(nextAction), expiresAt.toISOString()],
  );
}

export async function clearPendingRecommendation(userId: string, pool: Queryable = getPool()): Promise<void> {
  await pool.query(`DELETE FROM pending_recommendations WHERE user_id = $1`, [userId]);
}
