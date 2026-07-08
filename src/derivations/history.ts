/**
 * Recent exercise history -- not part of the original spec's derivations
 * (docs/spec/13-data-layer.md), added to back a client history view. Only
 * `exercise_result` events (not `rest`), most-recent-first.
 */

import { getPool, type Queryable } from "../db.js";

export interface HistoryEntry {
  eventId: string;
  exerciseId: string;
  title: string;
  icon: string | null;
  completedAt: string;
  date: string;
}

export async function getRecentExerciseHistory(
  userId: string,
  limit: number,
  pool: Queryable = getPool(),
): Promise<HistoryEntry[]> {
  const { rows } = await pool.query<{
    event_id: string;
    exercise_id: string;
    title: string;
    icon: string | null;
    completed_at: string;
    date: string;
  }>(
    `
    SELECT
      e.event_id, e.exercise_id,
      x.metadata->>'name' AS title,
      x.metadata->>'icon' AS icon,
      e.completed_at,
      ((e.completed_at AT TIME ZONE e.timezone)::date)::text AS date
    FROM events e
    JOIN exercises x ON x.exercise_id = e.exercise_id
    WHERE e.user_id = $1 AND e.type = 'exercise_result'
    ORDER BY e.completed_at DESC
    LIMIT $2
    `,
    [userId, limit],
  );

  return rows.map((r) => ({
    eventId: r.event_id,
    exerciseId: r.exercise_id,
    title: r.title,
    icon: r.icon,
    completedAt: r.completed_at,
    date: r.date,
  }));
}
