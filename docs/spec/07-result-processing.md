# 5. Result Processing Logic

[← Index](../README.md) · Previous: [Decision Pipeline](./06-decision-pipeline.md) · Next: [Daily Progress →](./08-daily-progress.md)

When a result is submitted:

## 5.1 Store Event

Append the event to user history.

## 5.2 Update Warmth

Increase warmth based on completed work.

Then apply decay based on time.

## 5.3 Update Fatigue

Add fatigue to the exercise's `(movementPattern, recoveryClass)` bucket(s) according to its `fatigueCost` and actual dose (see [2.8](./03-exercises-and-recovery.md#28-recovery-classes) for the decay formula).

## 5.4 Update Capability Scores

For each capability the completed exercise trains, compute a dose ratio (actual / prescribed, capped at 1.0 so exceeding the prescription doesn't over-reward) and the stimulus earned:

```
stimulusEarned[c] = capabilityEffects[c] × doseRatio
```

This value adds to today's per-capability stimulus (used in [Step 4](./06-decision-pipeline.md#step-4--determine-whether-enough-has-been-done-today)) regardless of outcome. It **also** grows the permanent capability score, with diminishing returns as the score approaches its target — but only if the completion was clean (see conditions below):

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

## 5.5 Update Pain Risk

If `maxPain > painLimit`, or the user stopped early due to discomfort, flag the exercise `elevatedRisk = true`. While flagged:

- the exercise receives a flat **−30** `riskPenalty` in [Step 7](./06-decision-pipeline.md#step-7--score-candidate-actions) scoring, on top of its baseline `riskLevel` penalty
- [Step 8](./06-decision-pipeline.md#step-8--apply-variation-rules)'s variation logic is forced to prefer its regression over the exercise itself or any of its progressions

The flag clears the next time that exercise (or one of its regressions) is completed with `maxPain ≤ painLimit` and no early stop — it does not expire on a timer.

## 5.6 Update Variation History

Record movement pattern, family, and variant.

## 5.7 Update Today Progress

Increase daily stimulus score (5.4's `stimulusEarned`, regardless of whether it also grew the permanent capability score).

---

[← Index](../README.md) · Previous: [Decision Pipeline](./06-decision-pipeline.md) · Next: [Daily Progress →](./08-daily-progress.md)
