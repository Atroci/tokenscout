// Determinism regression gate: the same PageExtract[] must reduce to the same
// DesignTokens document every time, independent of input array order. This is
// what lets a token diff across two runs mean "the site changed", not "the
// reducer's internal ordering changed" — see docs/METHODOLOGY.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleTokens } from "../src/tokens/index.js";
import type { PageExtract } from "../src/schema.js";

// A denser fixture than tokens.test.ts's: enough colors, sizes, and spacing
// values to exercise clustering and scale detection, not just pass-through.
const pages: PageExtract[] = [
  {
    url: "https://example.com/",
    breakpoint: 1280,
    colors: [
      { value: "#3a7bd5", role: "background-color", count: 40 },
      { value: "#3b7cd6", role: "color", count: 5 },
      { value: "rgb(58, 123, 213)", role: "border-color", count: 2 },
      { value: "#e23744", role: "color", count: 12 },
      { value: "#ffffff", role: "background-color", count: 80 },
      { value: "#111111", role: "color", count: 60 },
    ],
    type: { sizes: ["16px", "24px", "1.5rem", "14px", "32px"] },
    spacing: { values: ["8px", "16px", "1.5rem", "4px", "24px", "64px"] },
  },
  {
    url: "https://example.com/about",
    breakpoint: 375,
    colors: [
      { value: "#e23744", role: "background-color", count: 3 },
      { value: "#3a7bd5", role: "color", count: 9 },
    ],
    type: { sizes: ["14px", "16px", "20px"] },
    spacing: { values: ["8px", "0.5rem", "12px"] },
  },
];

/** Deep-clone so each call gets its own objects; assembleTokens must not
 * depend on any shared mutable state leaking between runs. */
function clonePages(): PageExtract[] {
  return structuredClone(pages);
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
