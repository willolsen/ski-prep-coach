# 4. Next Decision Pipeline

[← Index](../README.md) · Previous: [Server API](./05-server-api.md) · Next: [Result Processing →](./07-result-processing.md)

The `next` engine must run in this order.

## Step 1 — Load State

Load:

- user profile
- exercise library
- recovery classes
- full event history (or as much of it as the derivations in [Section 5](./07-result-processing.md) need)
- readiness state (today's manual entry, [2.10](./04-history-and-readiness.md#210-readiness-state))
- current date/time (in the user's timezone, [2.1](./02-capabilities.md#21-user-profile))

There is no separate "current capability state" to load — it doesn't exist as stored data. It's computed in Step 2 from the event history just loaded.

## Step 2 — Compute Derived State

Before choosing an action, compute fresh from the event history (nothing here is read from a cache that could be stale — see [Section 5](./07-result-processing.md) for each formula):

- capability scores and trends ([2.4](./02-capabilities.md#24-capability-state-derived))
- current warmth ([5.2](./07-result-processing.md#52-warmth))
- decayed fatigue per `(movementPattern, recoveryClass)` bucket ([5.3](./07-result-processing.md#53-fatigue))
- recovered buckets (hard eligibility gate, [2.8](./03-exercises-and-recovery.md#28-recovery-classes))
- today's stimulus ([5.7](./07-result-processing.md#57-daily-progress))
- readiness status
- recently repeated movement patterns ([5.6](./07-result-processing.md#56-variation-history))
- elevatedRisk flags ([5.5](./07-result-processing.md#55-pain-risk))
- blocked exercises
- limiting capabilities

This ensures stale state can never drive decisions, because there is no stored state to go stale — every one of these is recomputed from the event log each time.

## Step 3 — Safety Veto

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

## Step 4 — Determine Whether Enough Has Been Done Today

Compute `todayStimulusScore` as a priority-weighted sum of today's per-capability stimulus earned (stimulus per event is defined in [5.4](./07-result-processing.md#54-capability-score-growth)):

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

## Step 5 — Identify Limiting Capabilities

Rank capabilities by:

```
limitingRank = (target[c] − score[c]) × (priority[c] / 10)
```

adjusted upward if undertrained recently (no stimulus earned in the last 3 days) or `trend` is declining. The top-ranked capabilities (typically top 2–3) are flagged as **limiting** and receive the 1.5× scoring boost in [Step 7](#step-7--score-candidate-actions).

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

## Step 6 — Generate Candidate Actions

Generate candidates from the exercise library.

An exercise is initially eligible if:

- user has equipment (for MVP, all equipment in `availableEquipment` — [2.1](./02-capabilities.md#21-user-profile) — is assumed accessible at all times; there is no per-call context for current location. This can be added later as an optional `GET /next` parameter if it turns out to matter in practice)
- not medically constrained
- current level allows it
- readiness allows it
- warmth allows it
- its `(movementPattern, recoveryClass)` bucket is eligible ([2.8](./03-exercises-and-recovery.md#28-recovery-classes))
- target capability is useful
- fatigue cost is acceptable
- not currently flagged `elevatedRisk` without an eligible regression available ([5.5](./07-result-processing.md#55-pain-risk))

Example blocked exercise:

```json
{
  "exerciseId": "Romanian_Deadlift",
  "blocked": true,
  "reasonCodes": ["not_warm_enough"]
}
```

## Step 7 — Score Candidate Actions

Each candidate gets a score:

```
score(exercise) =
    Σ_c [ capabilityEffects[c] × (priority[c] / 10) × (1.5 if c is limiting else 1.0) ]
  + enjoymentBonus            (+10 flat if the exercise is tagged to a liked activity, else 0)
  − fatigueCost × (currentBucketFatigue[movementPattern, recoveryClass] / 100)
  − repetitionPenalty         (recency-based, decays over ~3 days; see Step 8)
  − riskPenalty               (riskLevel baseline: low=0, moderate=5, high=15; +30 if elevatedRisk flagged — 5.5)
```

`currentBucketFatigue` is the exercise's own `(movementPattern, recoveryClass)` bucket fatigue ([5.3](./07-result-processing.md#53-fatigue)) — a single number, since fatigue is tracked per bucket, not per capability (2.8).

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

## Step 8 — Apply Variation Rules

The engine should prefer useful variation, not random variation.

Hierarchy:

```
Capability → Movement Pattern → Exercise Family → Variant
```

Rules:

- Do not repeat the same exercise too often if safe substitutes exist (already penalized via `repetitionPenalty` in [Step 7](#step-7--score-candidate-actions)).
- Do not vary so much that progression becomes unmeasurable.
- Prefer variants in the same movement family when the same training effect is desired.
- Use regressions if readiness or warmth is low, or if the exercise is flagged `elevatedRisk` ([5.5](./07-result-processing.md#55-pain-risk)).
- Use progressions only when recent results justify it.

Example:

```json
{
  "movementPattern": "hinge",
  "recentVariants": ["Romanian_Deadlift"],
  "suggestedVariant": "Stiff-Legged_Dumbbell_Deadlift",
  "reason": "same pattern, less repetition, appropriate load"
}
```

## Step 9 — Select Dose

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

## Step 10 — Build Explanation

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
