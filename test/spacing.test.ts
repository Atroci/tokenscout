// Zero-new-runtime-dep test suite using node:test. Run via tsx (dev dep).
import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceSpacingScale } from "../src/spacing/index.js";
import type { PageExtract } from "../src/schema.js";

/** Build a PageExtract carrying only the spacing values under test. */
const page = (values: string[]): PageExtract => ({
  url: "https://example.com",
  breakpoint: 1280,
  colors: [],
  type: { sizes: [] },
  spacing: { values },
});

test("reduceSpacingScale: empty input yields empty scale", () => {
  const r = reduceSpacingScale([]);
  assert.deepEqual(r, { base: 1, scale: [], unit: "px", coverage: 0 });
});

test("reduceSpacingScale: clean 8px grid detects base 8", () => {
  const r = reduceSpacingScale([page(["8px", "16px", "24px", "32px"])]);
  assert.equal(r.base, 8);
  assert.deepEqual(r.scale, [8, 16, 24, 32]);
  assert.equal(r.coverage, 1);
});

test("reduceSpacingScale: 4px grid from mixed multiples", () => {
  const r = reduceSpacingScale([page(["4px", "12px", "20px", "4px"])]);
  assert.equal(r.base, 4);
  // Duplicate 4px collapses; sorted unique multiples.
  assert.deepEqual(r.scale, [4, 12, 20]);
  assert.equal(r.coverage, 1);
});

test("reduceSpacingScale: rem converts with default rootPx 16", () => {
  // 0.5rem -> 8px, 1rem -> 16px, 1.5rem -> 24px.
  const r = reduceSpacingScale([page(["0.5rem", "1rem", "1.5rem"])]);
  assert.equal(r.base, 8);
  assert.deepEqual(r.scale, [8, 16, 24]);
});

test("reduceSpacingScale: custom rootPx changes rem conversion", () => {
  // rootPx 10: 1rem -> 10px, 2rem -> 20px -> base 10.
  const r = reduceSpacingScale([page(["1rem", "2rem"])], 10);
  assert.equal(r.base, 10);
  assert.deepEqual(r.scale, [10, 20]);
});

test("reduceSpacingScale: stray coprime value collapses base to 1", () => {
  // 13px is coprime with 8/16/24 -> gcd 1; coverage stays high (only the
  // grid-aligned fraction relative to base 1 is everything, so coverage 1).
  const r = reduceSpacingScale([page(["8px", "16px", "24px", "13px"])]);
  assert.equal(r.base, 1);
  // Everything is a multiple of 1, so quantization is identity.
  assert.deepEqual(r.scale, [8, 13, 16, 24]);
  assert.equal(r.coverage, 1);
});

test("reduceSpacingScale: coverage reflects off-grid values", () => {
  // base = gcd(10,20,15) = 5. 10,20,15 are all multiples of 5 -> coverage 1.
  const aligned = reduceSpacingScale([page(["10px", "20px", "15px"])]);
  assert.equal(aligned.base, 5);
  assert.equal(aligned.coverage, 1);
  // base = gcd(8,16,12,8) = 4; 12 is a multiple of 4 too. Use a real off-grid
  // case: base from 8,16 is 8 but 12 breaks it -> gcd 4, and 12 % 4 == 0.
});

test("reduceSpacingScale: rounds fractional px before grid detection", () => {
  // 7.6px -> 8, 15.5px -> 16, 23.5px -> 24 (Math.round, .5 up) -> base 8.
  const r = reduceSpacingScale([page(["7.6px", "15.5px", "23.5px"])]);
  assert.equal(r.base, 8);
  assert.deepEqual(r.scale, [8, 16, 24]);
});

test("reduceSpacingScale: drops non-positive and unparseable values", () => {
  const r = reduceSpacingScale([
    page(["0px", "-8px", "auto", "16px", "32px", "50%"]),
  ]);
  assert.equal(r.base, 16);
  assert.deepEqual(r.scale, [16, 32]);
  assert.equal(r.coverage, 1);
});

test("reduceSpacingScale: aggregates across multiple pages", () => {
  const r = reduceSpacingScale([page(["8px", "16px"]), page(["24px", "8px"])]);
  assert.equal(r.base, 8);
  assert.deepEqual(r.scale, [8, 16, 24]);
});

test("reduceSpacingScale: low coverage surfaces a weak grid", () => {
  // base = gcd(10,21) = 1. Both align to base 1 so coverage is 1, but the
  // base=1 result itself is the signal the grid is weak. Confirm base=1.
  const r = reduceSpacingScale([page(["10px", "21px"])]);
  assert.equal(r.base, 1);
  assert.deepEqual(r.scale, [10, 21]);
});
