-- Reference tables (docs/spec/13-data-layer.md#reference-tables)

CREATE TABLE users (
  user_id       text PRIMARY KEY,
  display_name  text NOT NULL,
  profile       jsonb NOT NULL   -- availableEquipment, movementPatternRestrictions, preferences (User Profile)
);

CREATE TABLE capabilities (
  capability_id text PRIMARY KEY,   -- e.g. 'knee_capacity'
  name          text NOT NULL,
  priority      smallint NOT NULL,
  description   text,
  target        smallint GENERATED ALWAYS AS (LEAST(100, 25 + 5 * priority)) STORED   -- (Capability Targets)
);

CREATE TABLE recovery_classes (
  recovery_class   text PRIMARY KEY,   -- e.g. 'heavy_strength'
  min_rest_hours   integer NOT NULL,
  max_per_day      integer NOT NULL,
  max_per_week     integer NOT NULL,
  half_life_hours  numeric NOT NULL
);

CREATE TABLE exercises (
  exercise_id                      text PRIMARY KEY,   -- free-exercise-db id or custom id (Exercise Definition)
  base_source                      text NOT NULL,      -- 'free-exercise-db' | 'custom'
  movement_pattern                 text NOT NULL,      -- one of the 7 ids (Movement Patterns)
  family_id                        text NOT NULL,      -- groups substitutable variants; a real column because variation logic queries by it directly
  progression_level                numeric NOT NULL,   -- comparable only within the same family_id (or movement_pattern as fallback)
  recovery_class                   text NOT NULL REFERENCES recovery_classes(recovery_class),
  risk_level                       text NOT NULL,
  general_warmth_required          numeric NOT NULL,
  movement_pattern_warmth_required numeric NOT NULL,
  fatigue_cost                     numeric NOT NULL,   -- single scalar, per its own recovery bucket (Exercise Definition)
  warmth_effect                    numeric NOT NULL,   -- flat contribution per full-dose completion (Warmth State)
  capability_effects               jsonb NOT NULL,     -- per-capability stimulus map, e.g. {"posterior_chain": 8} (Exercise Definition)
  metadata                         jsonb NOT NULL      -- name, instructions, safetyNotes, free-exercise-db base fields, etc.
);

CREATE INDEX exercises_family_idx ON exercises (family_id, progression_level);
CREATE INDEX exercises_pattern_idx ON exercises (movement_pattern, progression_level);

-- Event log, readiness, and pending recommendations (docs/spec/13-data-layer.md#the-event-log-readiness-and-pending-recommendations)

CREATE TABLE events (
  event_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text NOT NULL REFERENCES users(user_id),
  type              text NOT NULL,   -- 'exercise_result' | 'rest'
  source            text NOT NULL,   -- 'live' | 'onboarding' | 'self_directed' (User Activity History, Logging Without a Recommendation)
  exercise_id       text REFERENCES exercises(exercise_id),   -- null for rest events
  recommendation_id uuid,                                     -- null for onboarding/self-directed entries (Logging Without a Recommendation)
  timezone          text NOT NULL,   -- client-supplied at submission time; no stored user-level timezone (User Profile, User Activity History)
  started_at        timestamptz NOT NULL,
  completed_at      timestamptz NOT NULL,
  prescribed        jsonb,           -- null when nothing was prescribed (Logging Without a Recommendation entries)
  actual            jsonb NOT NULL,  -- setsCompleted/durationSecCompleted/reps/maxPain/rpe/difficulty/notes (Exercise Prescription, User Activity History)
  dose_ratio        numeric NOT NULL,
  clean_completion  boolean NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX events_user_time_idx ON events (user_id, completed_at DESC);
CREATE INDEX events_user_exercise_time_idx ON events (user_id, exercise_id, completed_at DESC);

CREATE TABLE readiness_entries (
  user_id         text NOT NULL REFERENCES users(user_id),
  date            date NOT NULL,    -- derived from (now, timezone) at write time (Submit Readiness), never submitted directly
  entry           jsonb NOT NULL,   -- painNow, morningStiffness, swelling, stairs, sleepQuality (Readiness State)
  computed_status text NOT NULL,    -- green/yellow/red, computed once at write time using aggregateFatigue as of that same `now` (Deriving Fatigue and Warmth)
  PRIMARY KEY (user_id, date)
);
-- Written via INSERT ... ON CONFLICT (user_id, date) DO UPDATE — resubmitting for the same derived date overwrites it (Submit Readiness)

CREATE TABLE pending_recommendations (
  recommendation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text NOT NULL UNIQUE REFERENCES users(user_id),   -- one pending recommendation per user
  next_action       jsonb NOT NULL,   -- the full nextAction payload (Get Next Action)
  created_at        timestamptz NOT NULL DEFAULT now(),   -- bookkeeping only (real row-insert time); not read by any derivation
  expires_at        timestamptz NOT NULL                  -- set explicitly by the app as (request now) + 4 hours, not derived from created_at
);
