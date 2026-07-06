# Data Model: Movement Patterns, Exercises & Recovery

[← Index](../README.md) · Previous: [Capabilities](./02-capabilities.md) · Next: [History & Readiness →](./04-history-and-readiness.md)

User/capability model lives in [User Profile & Capabilities](./02-capabilities.md); history, readiness, and warmth live in [History & Readiness](./04-history-and-readiness.md).

## Movement Patterns

Every exercise has exactly one primary `movementPattern`, used for variation logic ([Apply Variation Rules](./06-decision-pipeline.md#apply-variation-rules)) and to scope recovery tracking ([Recovery Classes](#recovery-classes)). SkiPrepCoach uses the standard 7-pattern kinesiology taxonomy:

- `squat`
- `hinge`
- `lunge`
- `push`
- `pull`
- `rotation`
- `gait_locomotion` (walking, running, carrying, skating)

## Exercise Definition

Built on top of the [free-exercise-db](https://github.com/yuhonas/free-exercise-db) schema ([schema.json](https://github.com/yuhonas/free-exercise-db/blob/main/schema.json)) as the base layer, extended with SkiPrepCoach-specific fields. **free-exercise-db is the primary source for exercise data** — its 800+ exercises can be dropped in with zero field-mapping; each only needs the SkiPrepCoach extension fields authored before it's eligible for recommendation (see [Initial MVP Exercise Set](./09-mvp-exercises.md)).

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
| `baseSource` | `"free-exercise-db"` or `"custom"` — provenance. `"custom"` is for exercises authored specifically for SkiPrepCoach with no free-exercise-db equivalent (most of the MVP set in [Initial MVP Exercise Set](./09-mvp-exercises.md)) |
| `icon` | display emoji |
| `movementPattern` | one of the 7 ids in [Movement Patterns](#movement-patterns) — free-exercise-db has no equivalent concept |
| `familyId` | groups variants for [Apply Variation Rules](./06-decision-pipeline.md#apply-variation-rules)'s computed substitute/regression/progression logic |
| `progressionLevel` | a number placing this exercise on a difficulty scale, comparable only against other exercises sharing its `familyId` (or, failing that, its `movementPattern`) — see [Apply Variation Rules](./06-decision-pipeline.md#apply-variation-rules) |
| `variantTags` | free-form tags used in scoring/variation |
| `safetyNotes` | shown to the user; distinct from `instructions` |
| `generalWarmthRequired` | minimum general (whole-body) warmth needed ([Warmth](./07-result-processing.md#warmth); see [Warmth State](./04-history-and-readiness.md#warmth-state)) |
| `movementPatternWarmthRequired` | minimum warmth needed specifically in this exercise's own `movementPattern` bucket ([Warmth](./07-result-processing.md#warmth)) |
| `riskLevel` | baseline risk penalty input ([Score Candidate Actions](./06-decision-pipeline.md#score-candidate-actions)) |
| `recoveryClass` | [Recovery Classes](#recovery-classes) |
| `capabilityEffects` | per-capability stimulus value ([Capability Score Growth](./07-result-processing.md#capability-score-growth)) |
| `fatigueCost` | single scalar — fatigue contributed to this exercise's `(movementPattern, recoveryClass)` bucket per full-dose completion ([Fatigue](./07-result-processing.md#fatigue)). Not per-capability: fatigue is tracked only at the [bucket level](#recovery-classes), so there's nothing to break down by capability |
| `warmthEffect` | single scalar — warmth contributed per full-dose completion ([Warmth](./07-result-processing.md#warmth); see [Warmth State](./04-history-and-readiness.md#warmth-state)) |

There is deliberately no `substitutes`, `regressions`, or `progressions` field — **exercises do not reference each other.** An earlier version of this schema stored those as explicit arrays of exercise ids, which meant every new exercise required manually updating other exercises' arrays to point back at it, and kept the same information twice (once in the array, once implicitly in `familyId`/`movementPattern`). Now `familyId` plus `progressionLevel` are the only two pieces of data needed; which exercises count as substitutes, regressions, or progressions for a given exercise is computed at query time ([Apply Variation Rules](./06-decision-pipeline.md#apply-variation-rules), [Data Layer](./13-data-layer.md)), not stored anywhere.

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
  "progressionLevel": 5,
  "variantTags": ["barbell", "bilateral", "posterior_chain", "strength"],
  "safetyNotes": [
    "Do not round the lower back.",
    "Do not perform cold.",
    "Stop if back pain or sharp knee pain occurs."
  ],
  "generalWarmthRequired": 30,
  "movementPatternWarmthRequired": 40,
  "riskLevel": "moderate",
  "recoveryClass": "heavy_strength",
  "capabilityEffects": {
    "posterior_chain": 8,
    "lower_body_strength": 5,
    "fall_resilience": 2
  },
  "fatigueCost": 20,
  "warmthEffect": 25
}
```

`Stiff-Legged_Dumbbell_Deadlift`, `Kettlebell_One-Legged_Deadlift`, and other same-family exercises are no longer listed on this exercise at all — they're found by querying for `familyId: "hip_hinge"` when needed (see [Apply Variation Rules](./06-decision-pipeline.md#apply-variation-rules)), each with its own `progressionLevel` to rank them.

`capabilityEffects` is also the basis for stimulus and capability growth ([Capability Score Growth](./07-result-processing.md#capability-score-growth)), and `fatigueCost` is also the basis for the fatigue penalty in scoring ([Score Candidate Actions](./06-decision-pipeline.md#score-candidate-actions)).

Used by `next` logic for filtering, scoring, safety, recovery, variation, and explanation.

## Exercise Prescription

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

## Recovery Classes

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

**Fatigue is derived, not stored:** a bucket's current fatigue is a decayed sum over every historical event in that bucket, using the bucket's `halfLifeHours` — see [Fatigue](./07-result-processing.md#fatigue) for the formula. It feeds the fatigue penalty in [Score Candidate Actions](./06-decision-pipeline.md#score-candidate-actions) scoring as a soft signal; it's independent of the hard eligibility gate above (`minRestHours`/`maxPerDay`/`maxPerWeek`, which are computed directly from event timestamps and counts, not from decayed fatigue).

---

[← Index](../README.md) · Previous: [Capabilities](./02-capabilities.md) · Next: [History & Readiness →](./04-history-and-readiness.md)
