# Next Decision Pipeline

[← Index](../README.md) · Previous: [Server API](./05-server-api.md) · Next: [Result Processing →](./07-result-processing.md)

The `next` engine must run in this order.

## Load State

Load:

- user profile
- exercise library
- recovery classes
- full event history (or as much of it as the derivations in [Submitting a Result](./07-result-processing.md) need)
- readiness state (today's manual entry, [Readiness State](./04-history-and-readiness.md#readiness-state), where "today" is `now` converted to the request's `timezone`)
- `now` and `timezone`, both supplied with this request ([Get Next Action](./05-server-api.md#get-next-action) — `now` defaults to the real clock if omitted, `timezone` is required; neither is stored on the user profile). Every derivation in [Compute Derived State](#compute-derived-state) that depends on "now" uses this exact value, not an independent clock read (see the [Core Principle](./11-core-principle.md) note on why)

There is no separate "current capability state" to load — it doesn't exist as stored data. It's computed in [Compute Derived State](#compute-derived-state) from the event history just loaded.

## Compute Derived State

Before choosing an action, compute fresh from the event history (nothing here is read from a cache that could be stale — see [Submitting a Result](./07-result-processing.md) for each formula):

- capability scores ([Capability State (Derived)](./02-capabilities.md#capability-state-derived))
- current warmth ([Warmth](./07-result-processing.md#warmth))
- decayed fatigue per `(movementPattern, recoveryClass)` bucket ([Fatigue](./07-result-processing.md#fatigue))
- recovered buckets (hard eligibility gate, [Recovery Classes](./03-exercises-and-recovery.md#recovery-classes))
- today's stimulus ([Daily Progress](./07-result-processing.md#daily-progress))
- readiness status
- recently repeated movement patterns ([Variation History](./07-result-processing.md#variation-history))
- elevatedRisk flags ([Pain Risk](./07-result-processing.md#pain-risk))
- blocked exercises
- limiting capabilities

This ensures stale state can never drive decisions, because there is no stored state to go stale — every one of these is recomputed from the event log each time.

## Safety Veto

Immediately return rest/recovery if:

- pain now ≥4
- swelling reported
- limp or instability reported (`stairs` is `"difficult"` or `"unable"`, [Readiness State](./04-history-and-readiness.md#readiness-state))
- severe next-morning pain response
- red readiness state
- unsafe fatigue accumulation (`aggregateFatigue` ≥ 100 — see [Readiness State](./04-history-and-readiness.md#readiness-state))

Safety has veto power over all performance goals.

Possible output:

```json
{
  "type": "rest",
  "reasonCodes": ["safety_red_day", "pain_too_high"]
}
```

## Determine Whether Enough Has Been Done Today

Compute `todayStimulusScore` as a priority-weighted sum of today's per-capability stimulus earned (stimulus per event is defined in [Capability Score Growth](./07-result-processing.md#capability-score-growth)):

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

## Identify Limiting Capabilities

Rank capabilities by:

```
limitingRank = (target[c] − score[c]) × (priority[c] / 10)
```

adjusted upward if undertrained recently (no stimulus earned in the last 3 days). The top-ranked capabilities (typically top 2–3) are flagged as **limiting** and receive the 1.5× scoring boost in [Score Candidate Actions](#score-candidate-actions).

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

## Generate Candidate Actions

Generate candidates from the exercise library.

An exercise is initially eligible if:

- user has equipment (for MVP, all equipment in `availableEquipment` — [User Profile](./02-capabilities.md#user-profile) — is assumed accessible at all times; there is no per-call context for current location. This can be added later as an optional `GET /next` parameter if it turns out to matter in practice)
- its `movementPattern` is not restricted to `"avoid"` in `movementPatternRestrictions` ([User Profile](./02-capabilities.md#user-profile)); if restricted to `"mild"`, only eligible when its `recoveryClass` is `daily` or `light`
- readiness allows it (not excluded by the current red/yellow readiness state, [Readiness State](./04-history-and-readiness.md#readiness-state))
- general warmth ≥ its `generalWarmthRequired`, and its own movement pattern's warmth ≥ its `movementPatternWarmthRequired` ([Exercise Definition](./03-exercises-and-recovery.md#exercise-definition), [Warmth State](./04-history-and-readiness.md#warmth-state))
- its `(movementPattern, recoveryClass)` bucket is eligible ([Recovery Classes](./03-exercises-and-recovery.md#recovery-classes))
- target capability is useful
- not currently flagged `elevatedRisk` without an eligible computed regression available ([Pain Risk](./07-result-processing.md#pain-risk), [Apply Variation Rules](#apply-variation-rules))

There is deliberately no "current level allows it" criterion — an earlier version referenced the exercise's free-exercise-db `level` (beginner/intermediate/expert), but nothing in this spec defines a comparable user-side level to check it against. `level` is carried through as informational metadata only; [`progressionLevel`](./03-exercises-and-recovery.md#exercise-definition) is the field that actually drives progression/regression ([Apply Variation Rules](#apply-variation-rules)). There is likewise no separate "fatigue cost is acceptable" gate — fatigue is already a soft signal in [Score Candidate Actions](#score-candidate-actions)'s scoring, and a second, undefined hard threshold here would just double-gate the same thing.

Example blocked exercise:

```json
{
  "exerciseId": "Romanian_Deadlift",
  "blocked": true,
  "reasonCodes": ["not_warm_enough"]
}
```

## Score Candidate Actions

Each candidate gets a score:

```
score(exercise) =
    Σ_c [ capabilityEffects[c] × (priority[c] / 10) × (1.5 if c is limiting else 1.0) ]
  + enjoymentBonus            (+10 flat if the exercise is tagged to a liked activity, else 0)
  − fatigueCost × (currentBucketFatigue[movementPattern, recoveryClass] / 100)
  − repetitionPenalty         (recency-based, decays over ~3 days; see Apply Variation Rules, below)
  − riskPenalty               (riskLevel baseline: low=0, moderate=5, high=15; +30 if elevatedRisk flagged — see Pain Risk)
```

`currentBucketFatigue` is the exercise's own `(movementPattern, recoveryClass)` bucket fatigue ([Fatigue](./07-result-processing.md#fatigue)) — a single number, since fatigue is tracked per [bucket](./03-exercises-and-recovery.md#recovery-classes), not per capability.

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

## Apply Variation Rules

The engine should prefer useful variation, not random variation. **Exercises do not reference each other** ([Exercise Definition](./03-exercises-and-recovery.md#exercise-definition)) — "substitutes," "regressions," and "progressions" are not stored lists, they're computed at query time from `familyId`, `movementPattern`, and `progressionLevel`:

- **Substitutes** — other exercises sharing this exercise's `familyId`. If none are eligible, broaden to any exercise sharing just its `movementPattern`.
- **Regressions** — from that same substitute set, the exercise(s) with the next `progressionLevel` *below* this one.
- **Progressions** — from that same substitute set, the exercise(s) with the next `progressionLevel` *above* this one.

`progressionLevel` is only ever compared within a substitute set (same `familyId`, or same `movementPattern` as a fallback) — it's not a global difficulty scale across unrelated exercises. See [Data Layer](./13-data-layer.md) for the query.

Hierarchy:

```
Capability → Movement Pattern → Exercise Family → Variant
```

Rules:

- Do not repeat the same exercise too often if safe substitutes exist (already penalized via `repetitionPenalty` in [Score Candidate Actions](#score-candidate-actions)).
- Do not vary so much that progression becomes unmeasurable — prefer the same `familyId` over a same-`movementPattern`-only substitute when both are eligible.
- Use a computed regression if readiness or warmth is low, or if the exercise is flagged `elevatedRisk` ([Pain Risk](./07-result-processing.md#pain-risk)).
- Use a computed progression only when recent results justify it.

Example:

```json
{
  "exerciseId": "Romanian_Deadlift",
  "familyId": "hip_hinge",
  "progressionLevel": 5,
  "recentVariants": ["Romanian_Deadlift"],
  "suggestedVariant": "Stiff-Legged_Dumbbell_Deadlift",
  "suggestedVariantProgressionLevel": 4,
  "reason": "same family, lower repetition, appropriate load"
}
```

## Select Dose

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

## Build Explanation

Every recommendation must include:

1. What to do.
2. How to do it.
3. What to report afterward.
4. Why this was selected.
5. How it advances goals.
6. Why harder options were not selected, if relevant.

Use deterministic reason codes and message templates.

---

[← Index](../README.md) · Previous: [Server API](./05-server-api.md) · Next: [Result Processing →](./07-result-processing.md)
