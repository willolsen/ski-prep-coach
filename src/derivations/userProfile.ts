/** User profile (docs/spec/02-capabilities.md#user-profile) -- stable reference data, not derived from events. */

import { getPool, type Queryable } from "../db.js";

export interface UserProfile {
  userId: string;
  displayName: string;
  availableEquipment: string[];
  movementPatternRestrictions: Record<string, "mild" | "avoid">;
  preferences: {
    likes: string[];
    dislikes: string[];
    preferredSessionStyle: string;
  };
}

interface StoredProfile {
  availableEquipment?: string[];
  movementPatternRestrictions?: Record<string, "mild" | "avoid">;
  preferences?: { likes?: string[]; dislikes?: string[]; preferredSessionStyle?: string };
}

export async function getUserProfile(userId: string, pool: Queryable = getPool()): Promise<UserProfile | null> {
  const { rows } = await pool.query<{ user_id: string; display_name: string; profile: StoredProfile }>(
    `SELECT user_id, display_name, profile FROM users WHERE user_id = $1`,
    [userId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    userId: row.user_id,
    displayName: row.display_name,
    availableEquipment: row.profile.availableEquipment ?? [],
    movementPatternRestrictions: row.profile.movementPatternRestrictions ?? {},
    preferences: {
      likes: row.profile.preferences?.likes ?? [],
      dislikes: row.profile.preferences?.dislikes ?? [],
      preferredSessionStyle: row.profile.preferences?.preferredSessionStyle ?? "next_action",
    },
  };
}
