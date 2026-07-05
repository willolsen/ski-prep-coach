# 5. Submitting a Result

[← Index](../README.md) · Previous: [Decision Pipeline](./06-decision-pipeline.md) · Next: [Daily Progress →](./08-daily-progress.md)

`POST /result` does exactly one thing: **append the event to history** ([5.1](#51-store-event)). Nothing else is written. Capability score, fatigue, warmth, pain-risk flags, variation history, and daily progress are never separately updated or mutated — they're pure derivations from the event log ([2.9](./04-history-and-readiness.md#29-user-activity-history)), recomputed fresh whenever they're needed (typically the next `GET /next` call, via [Step 2](./06-decision-pipeline.md#step-2--compute-derived-state)). This section defines those derivation formulas.

## 5.1 Store Event

Append the event to user history ([2.9](./04-history-and-readiness.md#29-user-activity-history)), exactly as submitted. This is the only write in the entire system.

## 5.2 Warmth

Warmth is a decayed sum over recent events, not a stored-and-mutated counter — computed twice, with different filters, per [2.11](./04-history-and-readiness.md#211-warmth-state):

```
generalWarmth_now         = Σ over recent events e            [ warmthEffect(e) × doseRatio(e) × 0.5 ^ (minutesElapsed(e, now) / 20) ]
patternWarmth_now[p]      = Σ over recent events e where e.movementPattern = p [ warmthEffect(e) × doseRatio(e) × 0.5 ^ (minutesElapsed(e, now) / 20) ]
```

`warmthEffect(e)` is the exercise's own flat scalar field (2.6). The half-life is **20 minutes** for both — short, because warmth reflects being physically warmed up in the current session, not a lasting training effect. In practice only events from the last hour or so contribute meaningfully; anything older has decayed to near zero.

## 5.3 Fatigue

Fatigue is scoped per `(movementPattern, recoveryClass)` bucket ([2.8](./03-exercises-and-recovery.md#28-recovery-classes)), and is likewise a decayed sum over every historical event that falls into that bucket:

```
bucketFatigue_now = Σ over historical events e in this bucket [ fatigueCost(e) × doseRatio(e) × 0.5 ^ (hoursElapsed(e, now) / halfLifeHours) ]
```

using the bucket's `recoveryClass.halfLifeHours` ([2.8](./03-exercises-and-recovery.md#28-recovery-classes)). This feeds the fatigue penalty in [Step 7](./06-decision-pipeline.md#step-7--score-candidate-actions) scoring — it's a soft signal, not an eligibility check (the `minRestHours`/`maxPerDay`/`maxPerWeek` gate is a separate, harder check computed directly from event timestamps and counts in that same bucket).

## 5.4 Capability Score Growth

For each capability an exercise trains, a historical event contributes stimulus:

```
stimulusEarned[c] = capabilityEffects[c] × doseRatio
```

where `doseRatio` is actual dose over prescribed dose, capped at 1.0 so exceeding the prescription doesn't over-reward.

`score[c]` ([2.4](./02-capabilities.md#24-capability-state-derived)) is computed by folding this over every qualifying historical event in chronological order, applying diminishing returns as the running score approaches its target:

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

An event is skipped in the fold (contributes 0 to `scoreIncrement`, though it still counts toward that day's stimulus total, [5.7](#57-daily-progress)) if:

- pain exceeded `painLimit`
- `difficulty` ([2.9](./04-history-and-readiness.md#29-user-activity-history)) was `"too_hard"`
- user stopped early due to discomfort
- `rpe` ≥ `targetRpe` + 3

## 5.5 Pain Risk

An exercise is `elevatedRisk` if its **most recent** historical event (or its regression's most recent event) had `maxPain > painLimit` or an early stop due to discomfort. This is a direct lookup, not a stored flag: check the latest qualifying event each time eligibility ([Step 6](./06-decision-pipeline.md#step-6--generate-candidate-actions)) or scoring ([Step 7](./06-decision-pipeline.md#step-7--score-candidate-actions)) needs it.

While `elevatedRisk`:

- the exercise receives a flat **−30** `riskPenalty` in Step 7 scoring, on top of its baseline `riskLevel` penalty
- [Step 8](./06-decision-pipeline.md#step-8--apply-variation-rules)'s variation logic is forced to prefer its regression over the exercise itself or any of its progressions

The flag isn't "cleared" so much as it simply stops being true the next time that exercise (or one of its regressions) is completed with `maxPain ≤ painLimit` and no early stop — because at that point, the most recent qualifying event no longer indicates elevated risk.

## 5.6 Variation History

"Recently repeated movement pattern/family/variant" ([Step 8](./06-decision-pipeline.md#step-8--apply-variation-rules)) is read directly from recent history — look at the last few days of events and note their `movementPattern`, `familyId`, and exercise id. Nothing is separately recorded; the event log already has this.

## 5.7 Daily Progress

`currentStimulusScore` ([Section 6](./08-daily-progress.md)) is the sum of `stimulusEarned` ([5.4](#54-capability-score-growth)) across all of today's events (today defined by the `timezone` supplied with the current `GET /next` request, [3.1](./05-server-api.md#31-get-next-action) — each event's own stored `timezone`, [2.9](./04-history-and-readiness.md#29-user-activity-history), determines which day *it* falls on), regardless of whether a given event's `scoreIncrement` was skipped. Trying hard on a rep scheme and stopping early due to discomfort still counts as useful stimulus for the day, even though it doesn't grow the permanent capability score.

---

[← Index](../README.md) · Previous: [Decision Pipeline](./06-decision-pipeline.md) · Next: [Daily Progress →](./08-daily-progress.md)
