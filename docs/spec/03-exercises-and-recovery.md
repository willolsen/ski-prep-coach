# Data Model: Movement Patterns, Exercises & Recovery (2.5–2.8)

[← Index](../README.md) · Previous: [Capabilities](./02-capabilities.md) · Next: [History & Readiness →](./04-history-and-readiness.md)

Part of **2. Core Data Objects**. This file covers 2.5–2.8. User/capability model lives in [2.1–2.4](./02-capabilities.md); history, readiness, and warmth live in [2.9–2.11](./04-history-and-readiness.md).

## 2.5 Movement Patterns

Every exercise has exactly one primary `movementPattern`, used for variation logic ([Step 8](./06-decision-pipeline.md#step-8--apply-variation-rules)) and to scope recovery tracking ([2.8](#28-recovery-classes)). SkiPrepCoach uses the standard 7-pattern kinesiology taxonomy:

- `squat`
- `hinge`
- `lunge`
- `push`
- `pull`
- `rotation`
- `gait_locomotion` (walking, running, carrying, skating)

## 2.6 Exercise Definition

Built on top of the [free-exercise-db](https://github.com/yuhonas/free-exercise-db) schema ([schema.json](https://github.com/yuhonas/free-exercise-db/blob/main/schema.json)) as the base layer, extended with SkiPrepCoach-specific fields. **free-exercise-db is the primary source for exercise data** — its 800+ exercises can be dropped in with zero field-mapping; each only needs the SkiPrepCoach extension fields authored before it's eligible for recommendation (see [Section 7](./09-mvp-exercises.md)).

**Base fields** (verbatim from free-exercise-db):

| field | type | notes |
|---|---|---|
| `id` | string | pattern `^[0-9a-zA-Z_-]+$` |
| `name` | string | |
| `force` | `null \| "static" \| "pull" \| "push"` | |
| `level` | `"beginner" \| "intermediate" \| "expert"` | |
| `mechanic` | `null \| "isolation" \| "compound"` | |
| `equipment` | `null \| "medicine ball" \| "dumbbell" \| "body only" \| "bands" \| "kettlebells" \| "foam roll" \| "cable" \| "machine" \| "barbell" \| "exercise ball" \| "e-z curl bar" \| "other"` | single value, not an array |
| `primaryMuscles` | array of muscle enum | abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps |
| `secondaryMuscles` | array, same muscle enum | |
| `instructions` | array of strings | |
| `category` | `"powerlifting" \| "strength" \| "stretching" \| "cardio" \| "olympic weightlifting" \| "strongman" \| "plyometrics"` | |
| `images` | array of strings | relative paths into the free-exercise-db image set |

**SkiPrepCoach extension fields** (not part of free-exercise-db; required for an exercise to be recommendable):

| field | purpose |
|---|---|
| `baseSource` | `"free-exercise-db"` or `"custom"` — provenance. `"custom"` is for exercises authored specifically for SkiPrepCoach with no free-exercise-db equivalent (most of the MVP set in [Section 7](./09-mvp-exercises.md)) |
| `icon` | display emoji |
| `movementPattern` | one of the 7 ids in [2.5](#25-movement-patterns) — free-exercise-db has no equivalent concept |
| `familyId` | groups variants for [Step 8](./06-decision-pipeline.md#step-8--apply-variation-rules) variation logic |
| `variantTags` | free-form tags used in scoring/variation |
| `safetyNotes` | shown to the user; distinct from `instructions` |
| `requiresWarmth` | minimum warmth state ([2.11](./04-history-and-readiness.md#211-warmth-state)) required |
| `riskLevel` | baseline risk penalty input ([Step 7](./06-decision-pipeline.md#step-7--score-candidate-actions)) |
| `recoveryClass` | [2.8](#28-recovery-classes) |
| `snackSafeWhenCold` | whether this can be done without a warm-up |
| `capabilityEffects` | per-capability stimulus value ([5.4](./07-result-processing.md#54-capability-score-growth)) |
| `fatigueCost` | single scalar — fatigue contributed to this exercise's `(movementPattern, recoveryClass)` bucket per full-dose completion ([5.3](./07-result-processing.md#53-fatigue)). Not per-capability: fatigue is tracked only at the bucket level (2.8), so there's nothing to break down by capability |
| `substitutes` | alternate exercises for the same slot |
| `regressions` | easier variants ([Step 8](./06-decision-pipeline.md#step-8--apply-variation-rules)) |
| `progressions` | harder variants ([Step 8](./06-decision-pipeline.md#step-8--apply-variation-rules)) |

Example — [`Romanian_Deadlift`](https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Romanian_Deadlift.json), base fields exactly as published, extended with SkiPrepCoach fields:

```json
{
  "id": "Romanian_Deadlift",
  "name": "Romanian Deadlift",
  "force": "pull",
  "level": "intermediate",
  "mechanic": "compound",
  "equipment": "barbell",
  "primaryMuscles": ["hamstrings"],
  "secondaryMuscles": ["calves", "glutes", "lower back"],
  "instructions": [
    "Put a barbell in front of you on the ground and grab it using a pronated (palms facing down) grip that a little wider than shoulder width.",
    "Bend the knees slightly and keep the shins vertical, hips back and back straight. This will be your starting position.",
    "Keeping your back and arms completely straight at all times, use your hips to lift the bar as you exhale.",
    "Once you are standing completely straight up, lower the bar by pushing the hips back, only slightly bending the knees, unlike when squatting.",
    "Repeat for the recommended amount of repetitions."
  ],
  "category": "strength",
  "images": ["Romanian_Deadlift/0.jpg", "Romanian_Deadlift/1.jpg"],

  "baseSource": "free-exercise-db",
  "icon": "🏋",
  "movementPattern": "hinge",
  "familyId": "hip_hinge",
  "variantTags": ["barbell", "bilateral", "posterior_chain", "strength"],
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
  "fatigueCost": 20,
  "substitutes": [
    "Stiff-Legged_Dumbbell_Deadlift",
    "kettlebell_deadlift",
    "hip_hinge_dowel"
  ],
  "regressions": [
    "hip_hinge_dowel",
    "romanian_deadlift_light"
  ],
  "progressions": [
    "Kettlebell_One-Legged_Deadlift"
  ]
}
```

`Stiff-Legged_Dumbbell_Deadlift` and `Kettlebell_One-Legged_Deadlift` are real free-exercise-db entries. `kettlebell_deadlift` (plain bilateral), `hip_hinge_dowel`, and `romanian_deadlift_light` are `baseSource: "custom"` — dose variants and coaching-cue drills that don't exist as distinct database entries.

`capabilityEffects` is also the basis for stimulus and capability growth ([5.4](./07-result-processing.md#54-capability-score-growth)), and `fatigueCost` is also the basis for the fatigue penalty in scoring ([Step 7](./06-decision-pipeline.md#step-7--score-candidate-actions)).

Used by `next` logic for filtering, scoring, safety, recovery, variation, and explanation.

## 2.7 Exercise Prescription

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

## 2.8 Recovery Classes

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

**Fatigue is derived, not stored:** a bucket's current fatigue is a decayed sum over every historical event in that bucket, using the bucket's `halfLifeHours` — see [5.3](./07-result-processing.md#53-fatigue) for the formula. It feeds the fatigue penalty in [Step 7](./06-decision-pipeline.md#step-7--score-candidate-actions) scoring as a soft signal; it's independent of the hard eligibility gate above (`minRestHours`/`maxPerDay`/`maxPerWeek`, which are computed directly from event timestamps and counts, not from decayed fatigue).

---

[← Index](../README.md) · Previous: [Capabilities](./02-capabilities.md) · Next: [History & Readiness →](./04-history-and-readiness.md)
