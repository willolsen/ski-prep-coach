# Data Model: User Profile & Capabilities

[← Index](../README.md) · Previous: [Purpose](./01-purpose.md) · Next: [Exercises & Recovery →](./03-exercises-and-recovery.md)

Covers the user and capability model. Exercises and recovery live in [Exercises & Recovery](./03-exercises-and-recovery.md); history, readiness, and warmth live in [History & Readiness](./04-history-and-readiness.md).

## User Profile

Stores stable user-level information.

```json
{
  "userId": "user-001",
  "displayName": "Will",
  "availableEquipment": [
    "gym",
    "dumbbells",
    "barbell",
    "bike",
    "rollerblades",
    "pickleball_court",
    "hiking_trails"
  ],
  "movementPatternRestrictions": {
    "squat": "mild"
  },
  "preferences": {
    "likes": ["rollerblading", "hiking", "pickleball"],
    "dislikes": [],
    "preferredSessionStyle": "next_action"
  }
}
```

Used by `next` logic to filter exercises, prioritize goals, and bias recommendations toward enjoyable options.

`movementPatternRestrictions` maps a subset of the 7 movement patterns ([Movement Patterns](./03-exercises-and-recovery.md#movement-patterns)) to a restriction level: `"mild"` (only low-intensity exercises of that pattern are eligible) or `"avoid"` (that pattern is excluded from candidates entirely). Patterns not listed have no restriction. This replaces an earlier, more specific `constraints` design (knee sensitivity, low back caution, etc.) — rather than modeling each individual sensitivity and mapping it to affected exercises, the engine only needs to know which movement patterns the user should approach cautiously or not at all, and lets [Generate Candidate Actions](./06-decision-pipeline.md#generate-candidate-actions) apply that directly. See [Generate Candidate Actions](./06-decision-pipeline.md#generate-candidate-actions) for exactly how `"mild"` and `"avoid"` affect eligibility.

There is deliberately no `primaryGoal` field — that information is already implied by which [capabilities](#capability-definitions) exist and how they're prioritized, so a separate goal label would just be redundant with data the engine already has. There is likewise deliberately no `targetDate` or deadline field — the engine has no concept of time remaining toward a goal.

There is also no `timezone` field. Day-boundary calculations ([Determine Whether Enough Has Been Done Today](./06-decision-pipeline.md#determine-whether-enough-has-been-done-today), [Recovery Classes](./03-exercises-and-recovery.md#recovery-classes)) need the athlete's *current* local timezone, not a fixed stored one — so the client sends it with every request where the server needs to know "what day is it," rather than the server trusting a profile field that could go stale (e.g. while traveling). See [User Activity History](./04-history-and-readiness.md#user-activity-history) and [Get Next Action](./05-server-api.md#get-next-action) for where it's actually supplied.

## Capability Definitions

Capabilities are things the engine tries to improve.

```json
{
  "capabilities": {
    "knee_capacity": {
      "name": "Knee Capacity",
      "priority": 10,
      "description": "Ability of knees and surrounding tissues to tolerate skiing-relevant load."
    },
    "lower_body_strength": {
      "name": "Lower Body Strength",
      "priority": 9
    },
    "posterior_chain": {
      "name": "Posterior Chain",
      "priority": 8
    },
    "balance": {
      "name": "Balance",
      "priority": 9
    },
    "mobility": {
      "name": "Mobility",
      "priority": 7
    },
    "aerobic_endurance": {
      "name": "Aerobic Endurance",
      "priority": 7
    },
    "stamina": {
      "name": "Stamina",
      "priority": 8
    },
    "reaction": {
      "name": "Reaction",
      "priority": 6
    },
    "upper_body_strength": {
      "name": "Upper Body Strength",
      "priority": 5
    },
    "fall_resilience": {
      "name": "Fall Resilience",
      "priority": 6
    }
  }
}
```

Used to score candidate actions. Higher-priority capabilities receive more weight, especially if currently undertrained or limiting.

## Capability Targets

Each capability's target score is **derived from its priority** rather than hand-authored as a separate number, so the two can't drift out of sync:

```
target = min(100, 25 + 5 × priority)
```

| capability | priority | target |
|---|---|---|
| knee_capacity | 10 | 75 |
| lower_body_strength | 9 | 70 |
| balance | 9 | 70 |
| posterior_chain | 8 | 65 |
| stamina | 8 | 65 |
| mobility | 7 | 60 |
| aerobic_endurance | 7 | 60 |
| reaction | 6 | 55 |
| fall_resilience | 6 | 55 |
| upper_body_strength | 5 | 50 |

Capability scores ([Capability State (Derived)](#capability-state-derived)) are on a 0–100 scale, measured against these targets. Targets drive [Identify Limiting Capabilities](./06-decision-pipeline.md#identify-limiting-capabilities) (limiting capabilities) and [Determine Whether Enough Has Been Done Today](./06-decision-pipeline.md#determine-whether-enough-has-been-done-today) (daily stimulus).

## Capability State (Derived)

**Nothing here is stored.** A user's capability state is computed on demand, entirely from [User Activity History](./04-history-and-readiness.md#user-activity-history) plus the current time — there is no separate persisted "capability state" document to keep in sync with the event log. This is a deliberate architectural principle, not just true of capability score: see the [Core Principle](./11-core-principle.md) note on derived vs. stored state, which also applies to fatigue ([Recovery Classes](./03-exercises-and-recovery.md#recovery-classes)) and warmth ([Warmth State](./04-history-and-readiness.md#warmth-state)).

**`score[c]`** — replay every historical `exercise_result` event that trains capability `c`, in chronological order, applying the growth formula from [Capability Score Growth](./07-result-processing.md#capability-score-growth) one event at a time, starting from 0. The result is exactly the same diminishing-returns curve described there; it's just computed by folding over history rather than incrementally mutating a stored number.

**`lastTrainedAt`** — the `completedAt` of the most recent historical event that trained capability `c`.

There is deliberately no `trend` field for MVP. An earlier version compared `score[c]` now against `score[c]` ~14 days ago, but "meaningfully higher/lower" had no defined threshold, and computing it meant running the replay twice per capability for a ranking nudge that was hard to justify without real usage data to calibrate against. Cut for now; revisit once there's history to tune it with.

Example — what a `GET` of this computed view returns (not what's stored):

```json
{
  "userId": "user-001",
  "capabilities": {
    "knee_capacity": {
      "score": 22,
      "lastTrainedAt": "2026-07-04T09:20:00-07:00"
    },
    "lower_body_strength": {
      "score": 18,
      "lastTrainedAt": "2026-07-03T16:00:00-07:00"
    },
    "balance": {
      "score": 28,
      "lastTrainedAt": "2026-07-04T11:30:00-07:00"
    }
  }
}
```

There is no per-capability `fatigue` field here — fatigue is tracked only once, scoped per `(movementPattern, recoveryClass)` bucket, in [Recovery Classes](./03-exercises-and-recovery.md#recovery-classes).

**Implementation note:** replaying full history on every request is fine at this scale (a single user's event log stays small enough to fold in milliseconds for years of daily use). An implementation may cache this computation for performance, but the cache is never authoritative — it must always match a full replay of [User Activity History](./04-history-and-readiness.md#user-activity-history) exactly, and can be invalidated or rebuilt from the event log alone at any time. See [Deriving Capability Score: the Recursive Fold](./13-data-layer.md#deriving-capability-score-the-recursive-fold) for the actual recursive-query pattern that computes this.

This is also what makes onboarding simple (see [Logging Without a Recommendation](./05-server-api.md#logging-without-a-recommendation)): backfilling a few weeks of historical exercises is just inserting ordinary events with backdated timestamps — there's no separate "initial state" to bootstrap.

---

[← Index](../README.md) · Previous: [Purpose](./01-purpose.md) · Next: [Exercises & Recovery →](./03-exercises-and-recovery.md)
