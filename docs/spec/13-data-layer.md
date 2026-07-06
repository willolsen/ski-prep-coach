# Data Layer

[← Index](../README.md) · Previous: [Resolved Parameters Reference](./12-parameters-reference.md) · Next: [Server Framework & Deployment →](./14-server-framework.md)

This section maps the abstract [data model](./02-capabilities.md) and [derivation formulas](./07-result-processing.md) onto an actual PostgreSQL schema. It exists because the [Core Principle](./11-core-principle.md) — derive everything from the event log instead of storing it — only holds up if the database can actually do that derivation efficiently. PostgreSQL was chosen specifically because its recursive CTEs and window functions can express the sequential, aggregate-heavy computations in [Submitting a Result](./07-result-processing.md) directly, rather than pulling every event into application code to fold over.

## Technology & Hosting

PostgreSQL, everywhere:

- **Local**: official `postgres` Docker image, or a native install.
- **AWS**: RDS for PostgreSQL.
- **Azure**: Azure Database for PostgreSQL – Flexible Server.

All three speak the same wire protocol and SQL dialect — there is no compatibility gap to work around. Switching environments is a single `DATABASE_URL` connection string, set via environment variable; nothing else about the application changes.

`prescribed` and `actual` payloads ([Exercise Prescription](./03-exercises-and-recovery.md#exercise-prescription)) vary in shape by exercise type (duration-based vs. rep-based), so those are stored as `jsonb` columns rather than forcing every possible field into its own column. Everything that's always filtered, joined, or indexed on — `userId`, `exerciseId`, timestamps, `source`, `type` — gets a real column.

## What's Actually Stored

Per the [Core Principle](./11-core-principle.md), capability score, fatigue, warmth, pain-risk flags, variation history, and daily progress are never stored — only computed. That leaves surprisingly little to persist:

1. **The [event log](./04-history-and-readiness.md#user-activity-history)** — the one behavioral table. Append-only.
2. **Reference/config data** ([User Profile](./02-capabilities.md#user-profile), [Capability Definitions](./02-capabilities.md#capability-definitions), [Movement Patterns](./03-exercises-and-recovery.md#movement-patterns), [Exercise Definition](./03-exercises-and-recovery.md#exercise-definition), [Recovery Classes](./03-exercises-and-recovery.md#recovery-classes)) — users, capability definitions, movement patterns, exercises, recovery classes. This changes rarely (a new exercise gets added; a user updates their profile) and is never derived from events — it's just normal reference data.
3. **[Readiness entries](./04-history-and-readiness.md#readiness-state)** — one fresh manual entry per user per day. Not derived; it's new information the user provides.
4. **One deliberate exception: pending recommendations.** The `recommendationId` pinning behavior ([Get Next Action](./05-server-api.md#get-next-action)) — the same recommendation is returned until resolved or a 4-hour timeout — genuinely can't be derived from history, because it describes something that *hasn't happened yet*. This is the only piece of short-lived, independently-mutable state in the system, and it's scoped narrowly: one row per user, created by `GET /next`, deleted by `POST /result`, and eligible for expiry after 4 hours.

## Reference Tables

Seeded from the JSON already defined in the [data model](./02-capabilities.md) — these are config data, not something the app mutates during normal operation.

```sql
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
```

`family_id` and `progression_level` are real, indexed columns rather than `metadata` fields — unlike everything else in `metadata`, [Apply Variation Rules](./06-decision-pipeline.md#apply-variation-rules)'s substitute/regression/progression logic ([Substitutes, Regressions, and Progressions](#substitutes-regressions-and-progressions)) queries by them directly, so they need to be indexable, not buried in JSON.

`target` is a generated column, not a separately maintained value — it can never drift from `priority` because Postgres recomputes it, the same reasoning as everything else in this spec that's derived rather than stored.

One small consistency fix made while writing this schema: `warmthEffect` is now a formal per-exercise scalar extension field on the [exercise definition](./03-exercises-and-recovery.md#exercise-definition), the same pattern as `fatigueCost`, replacing the ad-hoc example lookup table in [Warmth State](./04-history-and-readiness.md#warmth-state) (which mixed specific exercise ids and generic category labels like `"heavy_strength"` in a way that didn't cleanly map to one column).

## The Event Log, Readiness, and Pending Recommendations

```sql
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
```

`created_at` on this table and on `events` is pure bookkeeping — when the row actually landed in the database — and is the one place `DEFAULT now()` is fine to leave as the database's real clock, since nothing in [Submitting a Result](./07-result-processing.md) reads it. `expires_at` is different: it's set by the application at insert time to the *request's* `now` plus 4 hours, and checked against the *request's* `now` on every later `GET /next` — never the database's own `now()` — so a test can create a recommendation at a simulated instant and later verify it's expired at simulated instant + 5 hours without any real waiting.

**`dose_ratio`** and **`clean_completion`** deserve a note, since at first glance they look like exactly the kind of stored derived state the [Core Principle](./11-core-principle.md) argues against. They aren't: both are pure, deterministic functions of *that same row's own* `prescribed`/`actual` fields — never a function of other rows — so they can't drift out of sync with anything, the same way a `GENERATED ALWAYS AS` column can't. They exist purely to avoid re-deriving "was this a clean completion, and what fraction of the prescription did it represent" via a sprawling `CASE` expression (duration vs. reps vs. sets) in every query that needs it ([Capability Score Growth](./07-result-processing.md#capability-score-growth)). In practice these would be computed application-side at write time (the shape-sniffing logic reads more naturally in TypeScript than SQL) rather than as generated columns, but the principle is the same: derived from sibling fields on an immutable, append-only row, not cross-row state.

## Deriving Capability Score: the Recursive Fold

This is the case that most needed a real database engine. The [Capability Score Growth](./07-result-processing.md#capability-score-growth) growth formula is a *sequential* fold — each event's contribution depends on the running score left by every prior event for that capability, because of the diminishing-returns term. That rules out a simple `SUM()`; it needs a recursive CTE walking one event at a time:

```sql
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
  SELECT DISTINCT ON (capability_id)
    capability_id, completed_at,
    stimulus_earned * 0.1 * (1 - 0::numeric / c.target) AS running_score
  FROM stimulus s JOIN capabilities c USING (capability_id)
  ORDER BY capability_id, completed_at ASC

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
```

The pattern: each recursive step joins forward to exactly the *next* chronological event for that capability, carrying `running_score` as an accumulator — the same "row-at-a-time recurrence relation" idiom used for running totals that aren't simple sums.

This will get refined once it's real code (indexing, ties, capabilities with zero events), but the shape is the reason PostgreSQL won the comparison — this exact computation is awkward in application code and awkward in engines without recursive queries, and natural here.

## Deriving Fatigue and Warmth

No recursion needed — these are decayed sums, not compounding folds, so a straight aggregate works ([Fatigue](./07-result-processing.md#fatigue), [Warmth](./07-result-processing.md#warmth)). Every `now()` a real-time version of this query would use is instead `$2`, the `now` supplied with the request ([Get Next Action](./05-server-api.md#get-next-action)) — never the database's own clock, per the [Core Principle](./11-core-principle.md):

```sql
-- Fatigue per (movementPattern, recoveryClass) bucket
SELECT
  x.movement_pattern, x.recovery_class,
  SUM(e.dose_ratio * x.fatigue_cost *
      POWER(0.5, EXTRACT(EPOCH FROM ($2::timestamptz - e.completed_at)) / 3600.0 / rc.half_life_hours)
  ) AS bucket_fatigue
FROM events e
JOIN exercises x ON x.exercise_id = e.exercise_id
JOIN recovery_classes rc ON rc.recovery_class = x.recovery_class
WHERE e.user_id = $1 AND e.type = 'exercise_result'
GROUP BY x.movement_pattern, x.recovery_class;

-- aggregateFatigue (Readiness State, Safety Veto): just MAX() over the query above, computed the same way

-- General warmth (20-minute half-life; anything older than ~3 hours is negligible, so the window filter is just an optimization)
SELECT SUM(
  e.dose_ratio * x.warmth_effect *
  POWER(0.5, EXTRACT(EPOCH FROM ($2::timestamptz - e.completed_at)) / 60.0 / 20.0)
) AS general_warmth
FROM events e
JOIN exercises x ON x.exercise_id = e.exercise_id
WHERE e.user_id = $1 AND e.completed_at > $2::timestamptz - interval '3 hours';

-- Per-movement-pattern warmth: same query, grouped by pattern instead of summed across all of them
SELECT
  x.movement_pattern,
  SUM(e.dose_ratio * x.warmth_effect *
      POWER(0.5, EXTRACT(EPOCH FROM ($2::timestamptz - e.completed_at)) / 60.0 / 20.0)
  ) AS pattern_warmth
FROM events e
JOIN exercises x ON x.exercise_id = e.exercise_id
WHERE e.user_id = $1 AND e.completed_at > $2::timestamptz - interval '3 hours'
GROUP BY x.movement_pattern;
```

## Substitutes, Regressions, and Progressions

Since [exercises don't reference each other](./03-exercises-and-recovery.md#exercise-definition), these are computed from `family_id`, `movement_pattern`, and `progression_level` rather than looked up from a stored list ([Apply Variation Rules](./06-decision-pipeline.md#apply-variation-rules)):

```sql
-- Substitutes for exercise $1: same family first, same movement pattern as a fallback if the family has no other eligible members
SELECT * FROM exercises
WHERE exercise_id != $1
  AND (
    family_id = (SELECT family_id FROM exercises WHERE exercise_id = $1)
    OR movement_pattern = (SELECT movement_pattern FROM exercises WHERE exercise_id = $1)
  )
ORDER BY (family_id = (SELECT family_id FROM exercises WHERE exercise_id = $1)) DESC, progression_level;

-- Regression: from that same set, the nearest progression_level below $1's own
-- Progression: the nearest progression_level above
```

The `ORDER BY` puts same-family rows first (matches `true` sorting after `false` when descending), so the caller can just take the first same-family regression/progression it finds and only fall back to same-pattern-only rows if none exist.

## The Rest: Recovery Eligibility, Pain Risk, Daily Progress

Simpler variations of the same patterns — grouped counts/timestamps, or a most-recent-row lookup:

```sql
-- Recovery-class hard eligibility gate for a given bucket (Generate Candidate Actions)
SELECT
  MAX(e.completed_at) AS last_done_at,
  COUNT(*) FILTER (WHERE e.completed_at > $4::timestamptz - interval '1 day') AS today_count,
  COUNT(*) FILTER (WHERE e.completed_at > $4::timestamptz - interval '7 days') AS week_count
FROM events e
JOIN exercises x ON x.exercise_id = e.exercise_id
WHERE e.user_id = $1 AND x.movement_pattern = $2 AND x.recovery_class = $3;
-- $4 is the request's `now`, not the database's now()
```

- **Pain risk** ([Pain Risk](./07-result-processing.md#pain-risk)): `SELECT actual FROM events WHERE user_id = $1 AND exercise_id = ANY($2) ORDER BY completed_at DESC LIMIT 1` — check `maxPain`/early-stop on the single most recent row for the exercise or its computed regressions ([Substitutes, Regressions, and Progressions](#substitutes-regressions-and-progressions)). No `now` needed — it's a pure ordering query.
- **Daily progress** ([Daily Progress](./07-result-processing.md#daily-progress)): `SUM` of stimulus, same shape as the [capability-score `stimulus` CTE](#deriving-capability-score-the-recursive-fold), filtered to `(completed_at AT TIME ZONE e.timezone)::date = ($3::timestamptz AT TIME ZONE $2)::date` — each event's *own* stored `timezone` places it on a day, compared against the timezone ($2) and `now` ($3) supplied with the current request.
- **Variation history** ([Variation History](./07-result-processing.md#variation-history)): plain `SELECT ... ORDER BY completed_at DESC LIMIT n`, no aggregation at all.

## Multi-User & Indexing

Every table with behavioral data leads with `user_id`, and every index leads with it too — in practice every query in this system is scoped to "this user's data," so `user_id` is always the first predicate. `users` is the tenancy root; nothing else has meaning without it. This was already implicit throughout the [data model](./02-capabilities.md) (every object already carries a `userId`) — the schema just makes it a real foreign key and an indexed column instead of a JSON field.

Postgres row-level security (RLS) is a natural future hardening step — a policy like `USING (user_id = current_setting('app.current_user_id'))` on `events` would make cross-user leakage a database-enforced invariant rather than something every query has to get right. Not needed for MVP (a single query filter is enough at this stage), but worth knowing it's there if the app grows beyond a single trusted client.

## Migrations & Configuration

A single `DATABASE_URL` environment variable selects the target — local Docker, RDS, or Azure Database for PostgreSQL — with no code branching between environments. Schema migrations and the reference-data seed (capabilities, recovery classes, movement patterns) are implementation work for when the server project actually starts, not fixed here.

---

[← Index](../README.md) · Previous: [Resolved Parameters Reference](./12-parameters-reference.md) · Next: [Server Framework & Deployment →](./14-server-framework.md)
