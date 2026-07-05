# free-exercise-db (vendored)

Source: [github.com/yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db), licensed [Unlicense](http://unlicense.org/) (public domain). See [spec 2.6](../../docs/spec/03-exercises-and-recovery.md#26-exercise-definition) for how this data maps into the SkiPrepCoach exercise schema.

## Contents

- `schema.json` — upstream JSON Schema for a single exercise
- `exercises.json` — all 800+ exercises, combined (a top-level JSON array)
- `images/` — *not committed* (gitignored); fetch on demand, see below

## Refreshing

```sh
npm run sync:exercises
```

Re-fetches `schema.json` and `exercises.json` from upstream `main`. Run this occasionally to pick up new/corrected exercises.

## Fetching images

Images aren't vendored by default (~2,500 files). To pull them down locally:

```sh
npm run sync:exercises -- --with-images
```

This downloads every path referenced in each exercise's `images` array into `data/free-exercise-db/images/<same-relative-path>`, e.g. `images/Romanian_Deadlift/0.jpg`. They stay gitignored — re-run the command whenever you need them locally rather than committing them.
