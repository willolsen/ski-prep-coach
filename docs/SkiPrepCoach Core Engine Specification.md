# SkiPrepCoach — Core Engine Specification v0.2

## 1. Purpose

SkiPrepCoach is a server-side decision engine that answers one question:

> What is the best next action for this user right now?

The client is thin. It displays the recommended action, collects the result, and sends that result back to the server.

The engine optimizes for safe, steady progress toward skiing capability by using:

- user goals
- exercise metadata
- recovery rules
- capability targets
- recent training history
- pain and effort feedback
- estimated readiness
- estimated warm-up state
- variation rules

There are no fixed workouts, snack mode, or user-selected plans, and **no concept of time-to-goal** — no deadlines, countdowns, or seasons. The engine only ever reasons about the athlete's current state (see Section 9). Everything is expressed as a repeated loop:

```
GET /next
→ user performs action
→ POST /result
→ engine updates state
→ GET /next
```

## 2. Core Data Objects

### 2.1 User Profile

Stores stable user-level information.

```json
{
  "userId": "user-001",
  "displayName": "Will",
  "primaryGoal": "ski_resilience",
  "timezone": "America/Los_Angeles",
  "availableEquipment": [
    "gym",
    "dumbbells",
    "barbell",
    "bike",
    "rollerblades",
    "pickleball_court",
    "hiking_trails"
  ],
  "constraints": {
    "kneeSensitivity": true,
    "lowBackCaution": true,
    "avoidBulking": true
  },
  "preferences": {
    "likes": ["rollerblading", "hiking", "pickleball"],
    "dislikes": [],
    "preferredSessionStyle": "next_action"
  }
}
```

Used by `next` logic to filter exercises, prioritize goals, and bias recommendations toward enjoyable options.

`timezone` defines the athlete's local day boundary — daily stimulus (Step 4) and recovery-class `maxPerDay` counters (2.8) reset at local midnight in this timezone.

There is deliberately no `targetDate` or deadline field — the engine has no concept of time remaining toward a goal.

### 2.2 Capability Definitions

Capabilities are things the engine tries to improve.

```json
{
  "capabilities": {
    "knee_capacity": {
      "name": "Knee Capacity",
      "icon": "🦵",
      "priority": 10,
      "description": "Ability of knees and surrounding tissues to tolerate skiing-relevant load."
    },
    "lower_body_strength": {
      "name": "Lower Body Strength",
      "icon": "🦿",
      "priority": 9
    },
    "posterior_chain": {
      "name": "Posterior Chain",
      "icon": "🍑",
      "priority": 8
    },
    "balance": {
      "name": "Balance",
      "icon": "⚖",
      "priority": 9
    },
    "mobility": {
      "name": "Mobility",
      "icon": "🤸",
      "priority": 7
    },
    "aerobic_endurance": {
      "name": "Aerobic Endurance",
      "icon": "🚴",
      "priority": 7
    },
    "stamina": {
      "name": "Stamina",
      "icon": "🔥",
      "priority": 8
    },
    "reaction": {
      "name": "Reaction",
      "icon": "⚡",
      "priority": 6
    },
    "upper_body_strength": {
      "name": "Upper Body Strength",
      "icon": "💪",
      "priority": 5
    },
    "fall_resilience": {
      "name": "Fall Resilience",
      "icon": "🛡",
      "priority": 6
    }
  }
}
```

Used to score candidate actions. Higher-priority capabilities receive more weight, especially if currently undertrained or limiting.

### 2.3 Capability Targets

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

Capability scores (2.4) are on a 0–100 scale, measured against these targets. Targets drive Step 5 (limiting capabilities) and Step 4 (daily stimulus).

### 2.4 User Capability State

Stores the current estimate of user ability, on a 0–100 scale (see 2.3 for targets).

```json
{
  "userId": "user-001",
  "capabilities": {
    "knee_capacity": {
      "score": 22,
      "trend": "improving",
      "lastTrainedAt": "2026-07-04T09:20:00-07:00",
      "fatigue": 12
    },
    "lower_body_strength": {
      "score": 18,
      "trend": "stable",
      "lastTrainedAt": "2026-07-03T16:00:00-07:00",
      "fatigue": 30
    },
    "balance": {
      "score": 28,
      "trend": "improving",
      "lastTrainedAt": "2026-07-04T11:30:00-07:00",
      "fatigue": 4
    }
  }
}
```

Fields:

- `score`: 0–100, measured against the target in 2.3.
- `trend`: improving, stable, declining, unknown.
- `lastTrainedAt`: used for recovery and variation.
- `fatigue`: current decayed fatigue for that capability (see 2.8 for the decay formula).

### 2.5 Movement Patterns

Every exercise has exactly one primary `movementPattern`, used for variation logic (Step 8) and to scope recovery tracking (2.8). SkiPrepCoach uses the standard 7-pattern kinesiology taxonomy:

- `squat`
- `hinge`
- `lunge`
- `push`
- `pull`
- `rotation`
- `gait_locomotion` (walking, running, carrying, skating)

### 2.6 Exercise Definition

Base exercise information. This should be compatible with Free Exercise DB style fields, then extended. `movementPattern` must be one of the 7 ids in 2.5.

```json
{
  "id": "romanian_deadlift_barbell",
  "name": "Barbell Romanian Deadlift",
  "icon": "🏋",
  "baseSource": "free-exercise-db",
  "movementPattern": "hinge",
  "familyId": "hip_hinge",
  "variantTags": ["barbell", "bilateral", "posterior_chain", "strength"],
  "equipment": ["barbell", "plates"],
  "bodyParts": ["hamstrings", "glutes", "back"],
  "instructions": [
    "Stand tall holding the barbell in front of your thighs.",
    "Hinge at the hips while keeping your back neutral.",
    "Lower until you feel a hamstring stretch.",
    "Return to standing by driving the hips forward."
  ],
  "safetyNotes": [
    "Do not round the lower back.",
    "Do not perform cold.",
    "Stop if back pain or sharp knee pain occurs."
  ],
  "requiresWarmth": "warm",
  "riskLevel": "moderate",
  "recoveryClass": "heavy_strength",
  "snackSafeWhenCold": false,
  "capabilityEffects": {
    "posterior_chain": 8,
    "lower_body_strength": 5,
    "fall_resilience": 2
  },
  "fatigueCost": {
    "posterior_chain": 20,
    "lower_body_strength": 12,
    "low_back": 12,
    "knee_capacity": 4
  },
  "substitutes": [
    "romanian_deadlift_dumbbell",
    "kettlebell_deadlift",
    "hip_hinge_dowel"
  ],
  "regressions": [
    "hip_hinge_dowel",
    "romanian_deadlift_dumbbell_light"
  ],
  "progressions": [
    "romanian_deadlift_barbell_heavy",
    "single_leg_rdl"
  ]
}
```

`capabilityEffects` is also the basis for stimulus and capability growth (5.4), and `fatigueCost` is also the basis for the fatigue penalty in scoring (Step 7).

Used by `next` logic for filtering, scoring, safety, recovery, variation, and explanation.

### 2.7 Exercise Prescription

A concrete recommended dose.

```json
{
  "exerciseId": "wall_sit",
  "load": "bodyweight",
  "sets": 3,
  "durationSec": 30,
  "restSec": 60,
  "targetRpe": 5,
  "painLimit": 3,
  "estimatedDurationSec": 210
}
```

Rep-based example:

```json
{
  "exerciseId": "bodyweight_squat",
  "load": "bodyweight",
  "sets": 2,
  "reps": 10,
  "tempo": {
    "downSec": 3,
    "pauseSec": 1,
    "upSec": 2
  },
  "restSec": 60,
  "targetRpe": 4,
  "painLimit": 3,
  "estimatedDurationSec": 180
}
```

Used as the returned `nextAction`.

### 2.8 Recovery Classes

Defines minimum recovery rules and fatigue decay rates.

```json
{
  "recoveryClasses": {
    "daily": {
      "minRestHours": 6,
      "maxPerDay": 6,
      "maxPerWeek": 42,
      "halfLifeHours": 9
    },
    "light": {
      "minRestHours": 12,
      "maxPerDay": 3,
      "maxPerWeek": 14,
      "halfLifeHours": 18
    },
    "moderate": {
      "minRestHours": 24,
      "maxPerDay": 2,
      "maxPerWeek": 6,
      "halfLifeHours": 36
    },
    "heavy_strength": {
      "minRestHours": 48,
      "maxPerDay": 1,
      "maxPerWeek": 3,
      "halfLifeHours": 72
    },
    "max_strength": {
      "minRestHours": 72,
      "maxPerDay": 1,
      "maxPerWeek": 2,
      "halfLifeHours": 108
    },
    "plyometric": {
      "minRestHours": 48,
      "maxPerDay": 1,
      "maxPerWeek": 3,
      "halfLifeHours": 72
    },
    "hiit": {
      "minRestHours": 48,
      "maxPerDay": 1,
      "maxPerWeek": 2,
      "halfLifeHours": 72
    }
  }
}
```

**Scope:** recovery is tracked per **(movementPattern, recoveryClass)** pair — not per specific exercise, and not globally per recovery class. Doing a `heavy_strength` hinge exercise (e.g. barbell RDL) blocks other `heavy_strength` hinge exercises for `minRestHours` and counts toward `hinge:heavy_strength`'s `maxPerDay`/`maxPerWeek`. It does **not** block `heavy_strength` squat work, and does not block `light`-class hinge work — those are different buckets. This lets fatigued tissue groups rest independently of unrelated movement patterns, while still preventing someone from dodging intended rest by swapping to a different exercise of the same class and pattern.

**Fatigue decay:** each bucket's fatigue decays exponentially using its recovery class's `halfLifeHours`, independent of the hard eligibility gate:

```
fatigue_now = fatigue_added × 0.5 ^ (hoursElapsed / halfLifeHours)
```

This decayed value feeds the fatigue penalty in Step 7 scoring — it's a soft signal, not an eligibility check (the `minRestHours`/`maxPerDay`/`maxPerWeek` gate above already handles hard blocking).

### 2.9 User Activity History

Every completed or attempted action is stored as an event — including acknowledged `rest` recommendations (see 3.1), which log the same way as exercise results.

```json
{
  "events": [
    {
      "eventId": "evt-001",
      "userId": "user-001",
      "type": "exercise_result",
      "startedAt": "2026-07-04T09:00:00-07:00",
      "completedAt": "2026-07-04T09:04:00-07:00",
      "exerciseId": "wall_sit",
      "prescribed": {
        "sets": 3,
        "durationSec": 30,
        "restSec": 60
      },
      "actual": {
        "setsCompleted": 3,
        "durationSecCompleted": 90,
        "load": "bodyweight",
        "maxPain": 1,
        "rpe": 5,
        "difficulty": "normal",
        "notes": "Felt fine."
      }
    }
  ]
}
```

Used to update capability, fatigue, warmth, exercise variation, readiness, and progression.

### 2.10 Readiness State

Computed from recent manual reports. For MVP this is **manual entry only** — no biometric/wearable integration. Garmin-shaped fields (resting HR, HRV, body battery, training readiness) are out of scope; `computedStatus` is derived only from the fields below. A biometric integration can be layered in later without changing the pipeline shape.

```json
{
  "date": "2026-07-04",
  "painNow": 1,
  "morningStiffness": "none",
  "swelling": false,
  "stairs": "easy",
  "sleepQuality": "good",
  "computedStatus": "green"
}
```

Rules:

- Red if swelling, limp, or pain ≥4.
- Yellow if pain 2–3, poor sleep, or elevated fatigue.
- Green if low pain, no swelling, normal movement, and acceptable fatigue.

Used early in the `next` pipeline.

### 2.11 Warmth State

Warmth is computed, not manually selected.

```json
{
  "warmth": {
    "score": 42,
    "state": "warm",
    "updatedAt": "2026-07-04T09:04:00-07:00",
    "source": "computed"
  }
}
```

Suggested states:

```json
{
  "cold": "0-19",
  "slightly_warm": "20-39",
  "warm": "40-69",
  "very_warm": "70-89",
  "fatigued": "90+ with high fatigue"
}
```

Warmth increases after movement and decays with inactivity.

Example warmth effects:

```json
{
  "walk_5_min": 10,
  "mobility_light": 8,
  "wall_sit": 8,
  "bodyweight_squat": 12,
  "heavy_strength": 25,
  "rollerblade_20_min": 35
}
```

Used to block cold-unsafe exercises and sequence actions naturally.

## 3. Server API

### 3.1 Get Next Action

```
GET /api/users/{userId}/next
```

A `recommendationId` is generated whenever a new `nextAction` (exercise **or** rest) is produced. Calling `GET /next` again before that recommendation is resolved returns the identical pinned recommendation (same `recommendationId`) rather than recomputing — this prevents the action changing out from under the user mid-session. A pending recommendation that's never resolved expires and is recomputed fresh after 4 hours.

Rest is not a special case in this lifecycle: it gets a `recommendationId` like any other action and is resolved via `POST /result` (a lightweight acknowledgment), which logs a `rest` event in history exactly like an exercise result does.

Returns:

```json
{
  "nextAction": {
    "type": "exercise",
    "recommendationId": "rec-20260704-001",
    "exerciseId": "wall_sit",
    "title": "Wall Sit",
    "icon": "🧍",
    "prescription": {
      "sets": 3,
      "durationSec": 30,
      "restSec": 60,
      "targetRpe": 5,
      "painLimit": 3
    },
    "estimatedDurationSec": 210,
    "instructions": [
      "Lean against a wall with feet hip-width apart.",
      "Slide down only as far as comfortable.",
      "Keep knees aligned with feet.",
      "Stop if pain exceeds 3/10."
    ],
    "completionQuestions": [
      "How many sets did you complete?",
      "What was the highest pain level?",
      "What was the effort level, 1-10?",
      "Anything unusual?"
    ],
    "why": [
      "Knee capacity is currently a high-priority capability.",
      "Wall sits provide useful tendon and quadriceps stimulus with low movement stress.",
      "You are not warm enough for heavier lower-body strength work yet."
    ]
  },
  "todayProgress": {
    "status": "in_progress",
    "stimulusScore": 38,
    "targetStimulusScore": 70,
    "percentComplete": 54
  },
  "stateSummary": {
    "readiness": "green",
    "warmth": "slightly_warm",
    "limitingCapabilities": ["knee_capacity", "lower_body_strength"]
  }
}
```

If rest is best:

```json
{
  "nextAction": {
    "type": "rest",
    "recommendationId": "rec-20260704-002",
    "title": "Rest Is the Best Next Action",
    "estimatedDurationSec": null,
    "instructions": [
      "No more training is recommended right now.",
      "Normal walking and daily activity are fine.",
      "Resume when the app recommends another action."
    ],
    "completionQuestions": [],
    "why": [
      "You have already reached today's useful training stimulus.",
      "Additional lower-body work would create more fatigue than adaptation.",
      "Recovery now increases the chance of productive training tomorrow."
    ]
  },
  "todayProgress": {
    "status": "complete",
    "stimulusScore": 76,
    "targetStimulusScore": 70,
    "percentComplete": 100
  }
}
```

The rest recommendation is acknowledged via the same `POST /result` endpoint (3.2), typically with a minimal `actual` payload, which resolves the pinned recommendation and logs the event.

### 3.2 Submit Result

```
POST /api/users/{userId}/results
```

Body:

```json
{
  "recommendationId": "rec-20260704-001",
  "exerciseId": "wall_sit",
  "startedAt": "2026-07-04T09:00:00-07:00",
  "completedAt": "2026-07-04T09:04:00-07:00",
  "actual": {
    "setsCompleted": 3,
    "durationSecCompleted": 90,
    "maxPain": 1,
    "rpe": 5,
    "difficulty": "normal",
    "notes": "Felt good."
  }
}
```

Server responsibilities:

1. Store event.
2. Update warmth.
3. Update fatigue.
4. Update capability estimates.
5. Update daily progress.
6. Update recovery predictions.
7. Make next recommendation available.

## 4. Next Decision Pipeline

The `next` engine must run in this order.

### Step 1 — Load State

Load:

- user profile
- current capability state
- exercise library
- recovery classes
- recent events
- readiness state
- current date/time (in the user's timezone, 2.1)

### Step 2 — Update Derived State

Before choosing an action, recompute:

- current warmth
- decayed fatigue (2.8)
- recovered (movementPattern, recoveryClass) buckets
- today's stimulus
- readiness status
- recently repeated movement patterns
- blocked exercises
- limiting capabilities

This ensures stale state does not drive decisions.

### Step 3 — Safety Veto

Immediately return rest/recovery if:

- pain now ≥4
- swelling reported
- limp or instability reported
- severe next-morning pain response
- red readiness state
- unsafe fatigue accumulation

Safety has veto power over all performance goals.

Possible output:

```json
{
  "type": "rest",
  "reasonCodes": ["safety_red_day", "pain_too_high"]
}
```

### Step 4 — Determine Whether Enough Has Been Done Today

Compute `todayStimulusScore` as a priority-weighted sum of today's per-capability stimulus earned (stimulus per event is defined in 5.4):

```
stimulusScore = Σ_c stimulusEarnedToday[c] × (priority[c] / 10)
```

`targetStimulusScore` is a fixed constant: **70**, the same every day for every user.

```json
{
  "todayStimulusScore": 76,
  "targetStimulusScore": 70,
  "capabilityStimulus": {
    "knee_capacity": 22,
    "balance": 8,
    "mobility": 12,
    "aerobic_endurance": 15
  }
}
```

If `stimulusScore ≥ targetStimulusScore` and no remaining candidate offers meaningful benefit without excessive fatigue cost, return rest. This prevents overtraining.

### Step 5 — Identify Limiting Capabilities

Rank capabilities by:

```
limitingRank = (target[c] − score[c]) × (priority[c] / 10)
```

adjusted upward if undertrained recently (no stimulus earned in the last 3 days) or `trend` is declining. The top-ranked capabilities (typically top 2–3) are flagged as **limiting** and receive the 1.5× scoring boost in Step 7.

Example:

```json
{
  "limitingCapabilities": [
    {
      "capabilityId": "knee_capacity",
      "score": 22,
      "priorityWeight": 10,
      "reason": "low_score_high_priority"
    },
    {
      "capabilityId": "lower_body_strength",
      "score": 18,
      "priorityWeight": 9,
      "reason": "low_score_high_priority"
    }
  ]
}
```

### Step 6 — Generate Candidate Actions

Generate candidates from the exercise library.

An exercise is initially eligible if:

- user has equipment (for MVP, all equipment in `availableEquipment` — 2.1 — is assumed accessible at all times; there is no per-call context for current location. This can be added later as an optional `GET /next` parameter if it turns out to matter in practice)
- not medically constrained
- current level allows it
- readiness allows it
- warmth allows it
- its `(movementPattern, recoveryClass)` bucket is eligible (2.8)
- target capability is useful
- fatigue cost is acceptable
- not currently flagged `elevatedRisk` without an eligible regression available (5.5)

Example blocked exercise:

```json
{
  "exerciseId": "romanian_deadlift_barbell",
  "blocked": true,
  "reasonCodes": ["not_warm_enough"]
}
```

### Step 7 — Score Candidate Actions

Each candidate gets a score:

```
score(exercise) =
    Σ_c [ capabilityEffects[c] × (priority[c] / 10) × (1.5 if c is limiting else 1.0) ]
  + enjoymentBonus            (+10 flat if the exercise is tagged to a liked activity, else 0)
  − Σ_c [ fatigueCost[c] × (currentFatigue[c] / 100) ]
  − repetitionPenalty         (recency-based, decays over ~3 days; see Step 8)
  − riskPenalty               (riskLevel baseline: low=0, moderate=5, high=15; +30 if elevatedRisk flagged — 5.5)
```

Example:

```json
{
  "exerciseId": "wall_sit",
  "score": 82,
  "reasonCodes": [
    "trains_limiting_capability",
    "low_current_fatigue",
    "no_repetition_penalty"
  ]
}
```

### Step 8 — Apply Variation Rules

The engine should prefer useful variation, not random variation.

Hierarchy:

```
Capability → Movement Pattern → Exercise Family → Variant
```

Rules:

- Do not repeat the same exercise too often if safe substitutes exist (already penalized via `repetitionPenalty` in Step 7).
- Do not vary so much that progression becomes unmeasurable.
- Prefer variants in the same movement family when the same training effect is desired.
- Use regressions if readiness or warmth is low, or if the exercise is flagged `elevatedRisk` (5.5).
- Use progressions only when recent results justify it.

Example:

```json
{
  "movementPattern": "hinge",
  "recentVariants": ["romanian_deadlift_barbell"],
  "suggestedVariant": "romanian_deadlift_dumbbell",
  "reason": "same pattern, less repetition, appropriate load"
}
```

### Step 9 — Select Dose

After selecting the exercise, choose dose. Dose is chosen **purely from that specific exercise's own history** — there is no separate "level" field anywhere in the model. Dose depends on:

- this exercise's most recent prescription and actual performance
- target RPE vs. actual RPE
- pain response vs. `painLimit`
- current fatigue/recovery state for the capabilities it trains
- current warmth

Example:

```json
{
  "exerciseId": "wall_sit",
  "doseReason": "increase_duration_slightly",
  "previous": {
    "sets": 3,
    "durationSec": 20,
    "maxPain": 1,
    "rpe": 4
  },
  "next": {
    "sets": 3,
    "durationSec": 30,
    "targetRpe": 5
  }
}
```

Progression should be conservative.

### Step 10 — Build Explanation

Every recommendation must include:

1. What to do.
2. How to do it.
3. What to report afterward.
4. Why this was selected.
5. How it advances goals.
6. Why harder options were not selected, if relevant.

Use deterministic reason codes and message templates.

## 5. Result Processing Logic

When a result is submitted:

### 5.1 Store Event

Append the event to user history.

### 5.2 Update Warmth

Increase warmth based on completed work.

Then apply decay based on time.

### 5.3 Update Fatigue

Add fatigue to the exercise's `(movementPattern, recoveryClass)` bucket(s) according to its `fatigueCost` and actual dose (see 2.8 for the decay formula).

### 5.4 Update Capability Scores

For each capability the completed exercise trains, compute a dose ratio (actual / prescribed, capped at 1.0 so exceeding the prescription doesn't over-reward) and the stimulus earned:

```
stimulusEarned[c] = capabilityEffects[c] × doseRatio
```

This value adds to today's per-capability stimulus (used in Step 4) regardless of outcome. It **also** grows the permanent capability score, with diminishing returns as the score approaches its target — but only if the completion was clean (see conditions below):

```
scoreIncrement[c] = stimulusEarned[c] × 0.1 × (1 − score[c] / target[c])
```

Example:

```json
{
  "exerciseId": "wall_sit",
  "capabilityEffects_knee_capacity": 6,
  "doseRatio": 1.0,
  "stimulusEarned": 6,
  "currentScore": 22,
  "target": 75,
  "scoreIncrement": 0.47,
  "newScore": 22.47
}
```

Do not apply the score increment (stimulus still counts toward today's total) if:

- pain exceeded `painLimit`
- form was poor
- user stopped early due to discomfort
- RPE was far above target

### 5.5 Update Pain Risk

If `maxPain > painLimit`, or the user stopped early due to discomfort, flag the exercise `elevatedRisk = true`. While flagged:

- the exercise receives a flat **−30** `riskPenalty` in Step 7 scoring, on top of its baseline `riskLevel` penalty
- Step 8's variation logic is forced to prefer its regression over the exercise itself or any of its progressions

The flag clears the next time that exercise (or one of its regressions) is completed with `maxPain ≤ painLimit` and no early stop — it does not expire on a timer.

### 5.6 Update Variation History

Record movement pattern, family, and variant.

### 5.7 Update Today Progress

Increase daily stimulus score (5.4's `stimulusEarned`, regardless of whether it also grew the permanent capability score).

## 6. Daily Progress

The user should see progress for the day, but not a rigid plan.

```json
{
  "date": "2026-07-04",
  "targetStimulusScore": 70,
  "currentStimulusScore": 38,
  "percentComplete": 54,
  "capabilityStimulus": {
    "knee_capacity": 16,
    "mobility": 8,
    "balance": 10,
    "aerobic_endurance": 4
  },
  "status": "in_progress"
}
```

This is used only to answer:

- Have we done enough today?
- Which capabilities have received enough stimulus?
- Which useful low-risk opportunities remain?

## 7. Initial MVP Exercise Set

Start with a small curated subset.

Examples:

- wall_sit
- bodyweight_squat
- step_up_low
- calf_raise
- single_leg_balance
- ankle_rocker
- hip_flexor_stretch
- ninety_ninety
- dead_bug
- pushup
- farmer_carry
- goblet_squat
- romanian_deadlift_dumbbell
- bike_easy
- walk_easy
- rollerblade_easy

Each of these still needs full SkiPrepCoach metadata authored — `movementPattern` (2.5), `recoveryClass`, `riskLevel`, `capabilityEffects`, `fatigueCost`, `substitutes`/`regressions`/`progressions` — before it can be recommended. Only the Barbell Romanian Deadlift (2.6) is fully specified as an example so far.

More exercises can be imported from Free Exercise DB, but each needs SkiPrepCoach metadata before recommendation.

## 8. MVP Development Order

1. Define exercise JSON.
2. Define user state JSON.
3. Implement event storage.
4. Implement derived state update.
5. Implement safety veto.
6. Implement candidate generation.
7. Implement candidate scoring.
8. Implement `GET /next`.
9. Implement `POST /result`.
10. Add explanations from reason codes.
11. Add variation rules.
12. Add capability scoring.

## 9. Core Principle

SkiPrepCoach is not a workout calendar.

It is a closed-loop coaching engine.

Each recommendation is based on the current state of the athlete, and each completed action changes that state. The engine has no concept of calendar time, deadlines, or seasons — it never reasons about "days until ski season" or paces itself against a target date. It only ever answers "what's the best next action given exactly where things stand right now."

The app's intelligence comes from the quality of:

- the exercise metadata
- the recovery model
- the capability model
- the user history
- the `next` decision logic

The UI exists only to show the next action and collect the result.

## 10. Resolved Parameters Reference

Quick lookup for every constant/formula decided during spec review, so implementation doesn't have to re-derive them:

| Parameter | Value |
|---|---|
| Capability score scale | 0–100 |
| Capability target formula | `min(100, 25 + 5 × priority)` (2.3) |
| Daily stimulus target | fixed **70**, same for every user/day (Step 4) |
| Capability growth learning rate | **0.1** (5.4) |
| Movement pattern taxonomy | squat, hinge, lunge, push, pull, rotation, gait_locomotion (2.5) |
| Recovery bucket scope | per `(movementPattern, recoveryClass)` pair, not per exercise (2.8) |
| Fatigue decay | exponential; half-life = that bucket's `recoveryClass.halfLifeHours` (2.8) |
| `halfLifeHours` defaults | daily 9h, light 18h, moderate 36h, heavy_strength 72h, max_strength 108h, plyometric 72h, hiit 72h |
| Limiting-capability scoring boost | 1.5× (Step 5 / Step 7) |
| Enjoyment bonus | flat **+10** (Step 7) |
| Risk penalty | riskLevel baseline (low 0 / moderate 5 / high 15) **+30** if `elevatedRisk` flagged (Step 7, 5.5) |
| Repetition penalty | recency-decayed over ~3 days (Step 7 / Step 8) |
| `recommendationId` lifecycle | pinned until resolved via `POST /result`, or recomputed after a 4h timeout (3.1) |
| Equipment/location context | not modeled for MVP; all `availableEquipment` assumed accessible (Step 6) |
| Dose progression ("level") | purely per-exercise history-driven; no separate level field (Step 9) |
| Readiness inputs | manual entry only for MVP; no biometric/wearable integration (2.10) |
| Day boundary | user profile `timezone` field; resets at local midnight (2.1) |
| Rest actions | same recommendation lifecycle as exercises; logged as an event once acknowledged (2.9, 3.1) |
| Time-to-goal concept | **none** — no deadlines, countdowns, or seasons anywhere in the engine (Section 9) |
