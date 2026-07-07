import assert from "node:assert/strict";

/** Numeric derivations round-trip through Postgres `numeric` -> JS float; compare with tolerance, not equality. */
export function assertClose(actual: number, expected: number, epsilon = 1e-6, message?: string): void {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    message ?? `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}
