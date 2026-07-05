# 11. Data Layer

[← Index](../README.md) · Previous: [Resolved Parameters Reference](./11-parameters-reference.md)

This section maps the abstract data model (Section 2) and derivation formulas (Section 5) onto an actual PostgreSQL schema. It exists because the [Core Principle](./01-purpose-and-principles.md#9-core-principle) — derive everything from the event log instead of storing it — only holds up if the database can actually do that derivation efficiently. PostgreSQL was chosen specifically because its recursive CTEs and window functions can express the sequential, aggregate-heavy computations in Section 5 directly, rather than pulling every event into application code to fold over.

## 11.1 Technology & Hosting

PostgreSQL, everywhere:

- **Local**: official `postgres` Docker image, or a native install.
- **AWS**: RDS for PostgreSQL.
- **Azure**: Azure Database for PostgreSQL – Flexible Server.

All three speak the same wire protocol and SQL dialect — there is no compatibility gap to work around. Switching environments is a single `DATABASE_URL` connection string, set via environment variable; nothing else about the application changes.

`prescribed` and `actual` payloads (2.7) vary in shape by exercise type (duration-based vs. rep-based), so those are stored as `jsonb` columns rather than forcing every possible field into its own column. Everything that's always filtered, joined, or indexed on — `userId`, `exerciseId`, timestamps, `source`, `type` — gets a real column.

## 11.2 What's Actually Stored

Per the [Core Principle](./01-purpose-and-principles.md#9-core-principle), capability score, fatigue, warmth, pain-risk flags, variation history, and daily progress are never stored — only computed. That leaves surprisingly little to persist:

1. **The event log** (2.9) — the one behavioral table. Append-only.
2. **Reference/config data** (2.1, 2.2, 2.5, 2.6, 2.8) — users, capability definitions, movement patterns, exercises, recovery classes. This changes rarely (a new exercise gets added; a user updates their profile) and is never derived from events — it's just normal reference data.
3. **Readiness entries** (2.10) — one fresh manual entry per user per day. Not derived; it's new information the user provides.
4. **One deliberate exception: pending recommendations.** The `recommendationId` pinning behavior (3.1) — the same recommendation is returned until resolved or a 4-hour timeout — genuinely can't be derived from history, because it describes something that *hasn't happened yet*. This is the only piece of short-lived, independently-mutable state in the system, and it's scoped narrowly: one row per user, created by `GET /next`, deleted by `POST /result`, and eligible for expiry after 4 hours.

## 11.3 Reference Tables

Seeded from the JSON already defined in Section 2 — these are config data, not something the app mutates during normal operation.

```sql
CREATE TABLE users (
  user_id       text PRIMARY KEY,
  display_name  text NOT NULL,
  primary_goal  text NOT NULL,
  timezone      text NOT NULL,
  profile       jsonb NOT NULL   -- availableEquipment, constraints, preferences (2.1)
);

CREATE TABLE capabilities (
  capability_id text PRIMARY KEY,   -- e.g. 'knee_capacity'
  name          text NOT NULL,
  icon          text,
  priority      smallint NOT NULL,
  description   text,
  target        smallint GENERATED ALWAYS AS (LEAST(100, 25 + 5 * priority)) STORED   -- (2.3)
);

CREATE TABLE recovery_classes (
  recovery_class   text PRIMARY KEY,   -- e.g. 'heavy_strength'
  min_rest_hours   integer NOT NULL,
  max_per_day      integer NOT NULL,
  max_per_week     integer NOT NULL,
  half_life_hours  numeric NOT NULL
);

CREATE TABLE exercises (
  exercise_id          text PRIMARY KEY,   -- free-exercise-db id or custom id (2.6)
  base_source          text NOT NULL,      -- 'free-exercise-db' | 'custom'
  movement_pattern     text NOT NULL,      -- one of the 7 ids (2.5)
  recovery_class       text NOT NULL REFERENCES recovery_classes(recovery_class),
  risk_level           text NOT NULL,
  requires_warmth      text NOT NULL,
  snack_safe_when_cold boolean NOT NULL,
  fatigue_cost         numeric NOT NULL,   -- single scalar, per its own recovery bucket (2.6)
  warmth_effect        numeric NOT NULL,   -- flat contribution per full-dose completion (2.11)
  capability_effects   jsonb NOT NULL,     -- per-capability stimulus map, e.g. {"posterior_chain": 8} (2.6)
  metadata             jsonb NOT NULL      -- name, instructions, safetyNotes, substitutes, regressions, progressions, free-exercise-db base fields, etc.
);
```

`target` is a generated column, not a separately maintained value — it can never drift from `priority` because Postgres recomputes it, the same reasoning as everything else in this spec that's derived rather than stored.

One small consistency fix made while writing this schema: `warmthEffect` is now a formal per-exercise scalar extension field on 2.6, the same pattern as `fatigueCost`, replacing the ad-hoc example lookup table in 2.11 (which mixed specific exercise ids and generic category labels like `"heavy_strength"` in a way that didn't cleanly map to one column).

## 11.4 The Event Log, Readiness, and Pending Recommendations

```sql
CREATE TABLE events (
  event_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text NOT NULL REFERENCES users(user_id),
  type              text NOT NULL,   -- 'exercise_result' | 'rest'
  source            text NOT NULL,   -- 'live' | 'onboarding' | 'self_directed' (2.9, 3.3)
  exercise_id       text REFERENCES exercises(exercise_id),   -- null for rest events
  recommendation_id uuid,                                     -- null for onboarding/self-directed entries (3.3)
  started_at        timestamptz NOT NULL,
  completed_at      timestamptz NOT NULL,
  prescribed        jsonb,           -- null when nothing was prescribed (3.3 entries)
  actual            jsonb NOT NULL,  -- setsCompleted/durationSecCompleted/reps/maxPain/rpe/difficulty/notes (2.7, 2.9)
  dose_ratio        numeric NOT NULL,
  clean_completion  boolean NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX events_user_time_idx ON events (user_id, completed_at DESC);
CREATE INDEX events_user_exercise_time_idx ON events (user_id, exercise_id, completed_at DESC);

CREATE TABLE readiness_entries (
  user_id         text NOT NULL REFERENCES users(user_id),
  date            date NOT NULL,
  entry           jsonb NOT NULL,   -- painNow, morningStiffness, swelling, stairs, sleepQuality (2.10)
  computed_status text NOT NULL,    -- green/yellow/red
  PRIMARY KEY (user_id, date)
);

CREATE TABLE pending_recommendations (
  recommendation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text NOT NULL UNIQUE REFERENCES users(user_id),   -- one pending recommendation per user
  next_action       jsonb NOT NULL,   -- the full nextAction payload (3.1)
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL
);
```

**`dose_ratio`** and **`clean_completion`** deserve a note, since at first glance they look like exactly the kind of stored derived state Section 9 argues against. They aren't: both are pure, deterministic functions of *that same row's own* `prescribed`/`actual` fields — never a function of other rows — so they can't drift out of sync with anything, the same way a `GENERATED ALWAYS AS` column can't. They exist purely to avoid re-deriving "was this a clean completion, and what fraction of the prescription did it represent" via a sprawling `CASE` expression (duration vs. reps vs. sets) in every query that needs it ([5.4](./07-result-processing.md#54-capability-score-growth)). In practice these would be computed application-side at write time (the shape-sniffing logic reads more naturally in TypeScript than SQL) rather than as generated columns, but the principle is the same: derived from sibling fields on an immutable, append-only row, not cross-row state.

## 11.5 Deriving Capability Score: the Recursive Fold

This is the case that most needed a real database engine. The [5.4](./07-result-processing.md#54-capability-score-growth) growth formula is a *sequential* fold — each event's contribution depends on the running score left by every prior event for that capability, because of the diminishing-returns term. That rules out a simple `SUM()`; it needs a recursive CTE walking one event at a time:

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

The pattern: each recursive step joins forward to exactly the *next* chronological event for that capability, carrying `running_score` as an accumulator — the same "row-at-a-time recurrence relation" idiom used for running totals that aren't simple sums. `trend` (2.4) reruns this same query with an added `completed_at <= now() - interval '14 days'` filter and compares.

This will get refined once it's real code (indexing, ties, capabilities with zero events), but the shape is the reason PostgreSQL won the comparison — this exact computation is awkward in application code and awkward in engines without recursive queries, and natural here.

## 11.6 Deriving Fatigue and Warmth

No recursion needed — these are decayed sums, not compounding folds, so a straight aggregate works ([5.3](./07-result-processing.md#53-fatigue), [5.2](./07-result-processing.md#52-warmth)):

```sql
-- Fatigue per (movementPattern, recoveryClass) bucket
SELECT
  x.movement_pattern, x.recovery_class,
  SUM(e.dose_ratio * x.fatigue_cost *
      POWER(0.5, EXTRACT(EPOCH FROM (now() - e.completed_at)) / 3600.0 / rc.half_life_hours)
  ) AS bucket_fatigue
FROM events e
JOIN exercises x ON x.exercise_id = e.exercise_id
JOIN recovery_classes rc ON rc.recovery_class = x.recovery_class
WHERE e.user_id = $1 AND e.type = 'exercise_result'
GROUP BY x.movement_pattern, x.recovery_class;

-- Warmth (20-minute half-life; anything older than ~3 hours is negligible, so the window filter is just an optimization)
SELECT SUM(
  e.dose_ratio * x.warmth_effect *
  POWER(0.5, EXTRACT(EPOCH FROM (now() - e.completed_at)) / 60.0 / 20.0)
) AS warmth_score
FROM events e
JOIN exercises x ON x.exercise_id = e.exercise_id
WHERE e.user_id = $1 AND e.completed_at > now() - interval '3 hours';
```

## 11.7 The Rest: Recovery Eligibility, Pain Risk, Daily Progress

Simpler variations of the same two patterns — grouped counts/timestamps, or a most-recent-row lookup:

```sql
-- Recovery-class hard eligibility gate for a given bucket (Step 6)
SELECT
  MAX(e.completed_at) AS last_done_at,
  COUNT(*) FILTER (WHERE e.completed_at > now() - interval '1 day') AS today_count,
  COUNT(*) FILTER (WHERE e.completed_at > now() - interval '7 days') AS week_count
FROM events e
JOIN exercises x ON x.exercise_id = e.exercise_id
WHERE e.user_id = $1 AND x.movement_pattern = $2 AND x.recovery_class = $3;
```

- **Pain risk** ([5.5](./07-result-processing.md#55-pain-risk)): `SELECT actual FROM events WHERE user_id = $1 AND exercise_id = ANY($2) ORDER BY completed_at DESC LIMIT 1` — check `maxPain`/early-stop on the single most recent row for the exercise or its regressions.
- **Daily progress** ([5.7](./07-result-processing.md#57-daily-progress)): `SUM` of stimulus, same shape as 11.5's `stimulus` CTE, filtered to `completed_at::date = today` in the user's timezone (2.1).
- **Variation history** ([5.6](./07-result-processing.md#56-variation-history)): plain `SELECT ... ORDER BY completed_at DESC LIMIT n`, no aggregation at all.

## 11.8 Multi-User & Indexing

Every table with behavioral data leads with `user_id`, and every index leads with it too — in practice every query in this system is scoped to "this user's data," so `user_id` is always the first predicate. `users` is the tenancy root; nothing else has meaning without it. This was already implicit throughout Section 2 (every object already carries a `userId`) — the schema just makes it a real foreign key and an indexed column instead of a JSON field.

Postgres row-level security (RLS) is a natural future hardening step — a policy like `USING (user_id = current_setting('app.current_user_id'))` on `events` would make cross-user leakage a database-enforced invariant rather than something every query has to get right. Not needed for MVP (a single query filter is enough at this stage), but worth knowing it's there if the app grows beyond a single trusted client.

## 11.9 Migrations & Configuration

A single `DATABASE_URL` environment variable selects the target — local Docker, RDS, or Azure Database for PostgreSQL — with no code branching between environments. Schema migrations and the reference-data seed (capabilities, recovery classes, movement patterns) are implementation work for when the server project actually starts, not fixed here.

---

[← Index](../README.md) · Previous: [Resolved Parameters Reference](./11-parameters-reference.md)
