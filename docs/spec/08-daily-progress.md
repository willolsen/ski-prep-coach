# 6. Daily Progress

[← Index](../README.md) · Previous: [Result Processing](./07-result-processing.md) · Next: [MVP Exercise Set →](./09-mvp-exercises.md)

The user should see progress for the day, but not a rigid plan. Like everything else derived from history, this is computed on demand ([5.7](./07-result-processing.md#57-daily-progress)) — not a stored daily counter that gets incremented and reset.

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

---

[← Index](../README.md) · Previous: [Result Processing](./07-result-processing.md) · Next: [MVP Exercise Set →](./09-mvp-exercises.md)
