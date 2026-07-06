# Submitting a Result

[← Index](../README.md) · Previous: [Decision Pipeline](./06-decision-pipeline.md) · Next: [Daily Progress →](./08-daily-progress.md)

`POST /result` does exactly one thing: **append the event to history** ([Store Event](#store-event)). Nothing else is written. Capability score, fatigue, warmth, pain-risk flags, variation history, and daily progress are never separately updated or mutated — they're pure derivations from the event log ([User Activity History](./04-history-and-readiness.md#user-activity-history)), recomputed fresh whenever they're needed (typically the next `GET /next` call, via [Compute Derived State](./06-decision-pipeline.md#compute-derived-state)). This section defines those derivation formulas.

Every `now` below is the same single value supplied with the request that's doing the computing ([Get Next Action](./05-server-api.md#get-next-action), [Submit Readiness](./05-server-api.md#submit-readiness)) — not an independent clock read inside each formula. See the [Core Principle](./11-core-principle.md) note on why "now" is always an explicit input.

## Store Event

Append the event to user history ([User Activity History](./04-history-and-readiness.md#user-activity-history)), exactly as submitted. This is the only write in the entire system.

## Warmth

Warmth is a decayed sum over recent events, not a stored-and-mutated counter — computed twice, with different filters, per [Warmth State](./04-history-and-readiness.md#warmth-state):

```
generalWarmth_now         = Σ over recent events e            [ warmthEffect(e) × doseRatio(e) × 0.5 ^ (minutesElapsed(e, now) / 20) ]
patternWarmth_now[p]      = Σ over recent events e where e.movementPattern = p [ warmthEffect(e) × doseRatio(e) × 0.5 ^ (minutesElapsed(e, now) / 20) ]
```

`warmthEffect(e)` is the exercise's own flat scalar field ([Exercise Definition](./03-exercises-and-recovery.md#exercise-definition)). The half-life is **20 minutes** for both — short, because warmth reflects being physically warmed up in the current session, not a lasting training effect. In practice only events from the last hour or so contribute meaningfully; anything older has decayed to near zero.

## Fatigue

Fatigue is scoped per `(movementPattern, recoveryClass)` bucket ([Recovery Classes](./03-exercises-and-recovery.md#recovery-classes)), and is likewise a decayed sum over every historical event that falls into that bucket:

```
bucketFatigue_now = Σ over historical events e in this bucket [ fatigueCost(e) × doseRatio(e) × 0.5 ^ (hoursElapsed(e, now) / halfLifeHours) ]
```

using the bucket's `recoveryClass.halfLifeHours` ([Recovery Classes](./03-exercises-and-recovery.md#recovery-classes)). This feeds the fatigue penalty in [Score Candidate Actions](./06-decision-pipeline.md#score-candidate-actions) scoring — it's a soft signal, not an eligibility check (the `minRestHours`/`maxPerDay`/`maxPerWeek` gate is a separate, harder check computed directly from event timestamps and counts in that same bucket).

## Capability Score Growth

For each capability an exercise trains, a historical event contributes stimulus:

```
stimulusEarned[c] = capabilityEffects[c] × doseRatio
```

where `doseRatio` is actual dose over prescribed dose, capped at 1.0 so exceeding the prescription doesn't over-reward.

`score[c]` ([Capability State (Derived)](./02-capabilities.md#capability-state-derived)) is computed by folding this over every qualifying historical event in chronological order, applying diminishing returns as the running score approaches its target:

```
scoreIncrement[c] = stimulusEarned[c] × 0.1 × (1 − runningScore[c] / target[c])
```

Example (one step of the fold):

```json
{
  "exerciseId": "wall_sit",
  "capabilityEffects_knee_capacity": 6,
  "doseRatio": 1.0,
  "stimulusEarned": 6,
  "runningScoreBeforeThisEvent": 22,
  "target": 75,
  "scoreIncrement": 0.47,
  "runningScoreAfterThisEvent": 22.47
}
```

An event is skipped in the fold (contributes 0 to `scoreIncrement`, though it still counts toward that day's stimulus total, [Daily Progress](#daily-progress)) if:

- pain exceeded `painLimit`
- `difficulty` ([User Activity History](./04-history-and-readiness.md#user-activity-history)) was `"too_hard"`
- user stopped early due to discomfort
- `rpe` ≥ `targetRpe` + 3

## Pain Risk

An exercise is `elevatedRisk` if its **most recent** historical event (or its regression's most recent event) had `maxPain > painLimit` or an early stop due to discomfort. This is a direct lookup, not a stored flag: check the latest qualifying event each time eligibility ([Generate Candidate Actions](./06-decision-pipeline.md#generate-candidate-actions)) or scoring ([Score Candidate Actions](./06-decision-pipeline.md#score-candidate-actions)) needs it.

While `elevatedRisk`:

- the exercise receives a flat **−30** `riskPenalty` in [Score Candidate Actions](./06-decision-pipeline.md#score-candidate-actions), on top of its baseline `riskLevel` penalty
- [Apply Variation Rules](./06-decision-pipeline.md#apply-variation-rules)'s variation logic is forced to prefer its regression over the exercise itself or any of its progressions

The flag isn't "cleared" so much as it simply stops being true the next time that exercise (or one of its regressions) is completed with `maxPain ≤ painLimit` and no early stop — because at that point, the most recent qualifying event no longer indicates elevated risk.

## Variation History

"Recently repeated movement pattern/family/variant" ([Apply Variation Rules](./06-decision-pipeline.md#apply-variation-rules)) is read directly from recent history — look at the last few days of events and note their `movementPattern`, `familyId`, and exercise id. Nothing is separately recorded; the event log already has this.

## Daily Progress

`currentStimulusScore` ([Daily Progress](./08-daily-progress.md)) is the sum of `stimulusEarned` ([Capability Score Growth](#capability-score-growth)) across all of today's events (today defined by the `timezone` supplied with the current `GET /next` request, [Get Next Action](./05-server-api.md#get-next-action) — each event's own stored `timezone`, [User Activity History](./04-history-and-readiness.md#user-activity-history), determines which day *it* falls on), regardless of whether a given event's `scoreIncrement` was skipped. Trying hard on a rep scheme and stopping early due to discomfort still counts as useful stimulus for the day, even though it doesn't grow the permanent capability score.

---

[← Index](../README.md) · Previous: [Decision Pipeline](./06-decision-pipeline.md) · Next: [Daily Progress →](./08-daily-progress.md)
