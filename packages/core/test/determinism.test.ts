// Determinism regression gate: the same PageExtract[] must reduce to the same
// DesignTokens document every time, independent of input array order. This is
// what lets a token diff across two runs mean "the site changed", not "the
// reducer's internal ordering changed" — see docs/METHODOLOGY.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleTokens } from "../src/tokens/index.js";
import type { PageExtract } from "../src/schema.js";
import { densePages } from "./fixtures.js";

/** Deep-clone so each call gets its own objects; assembleTokens must not
 * depend on any shared mutable state leaking between runs. */
function clonePages(): PageExtract[] {
  return structuredClone(densePages());
}

test("assembleTokens: identical input reduces to byte-identical output across repeated runs", () => {
  const runs = Array.from({ length: 5 }, () =>
    JSON.stringify(assembleTokens(clonePages()), null, 2),
  );
  for (const run of runs.slice(1)) {
    assert.equal(run, runs[0]);
  }
});

test("assembleTokens: output does not depend on the input pages' array order", () => {
  const forward = JSON.stringify(assembleTokens(clonePages()), null, 2);
  const reversed = JSON.stringify(
    assembleTokens([...clonePages()].reverse()),
    null,
    2,
  );
  assert.equal(reversed, forward);
});

test("assembleTokens: token ids are stable across runs (no positional reshuffling)", () => {
  const first = assembleTokens(clonePages());
  const second = assembleTokens(clonePages());
  assert.deepEqual(
    Object.keys(first.color ?? {}),
    Object.keys(second.color ?? {}),
  );
});
