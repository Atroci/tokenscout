// Zero-new-runtime-dep test suite using node:test. Run via tsx (dev dep).
import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceTypeScale } from "../src/type/index.js";
import type { PageExtract } from "../src/schema.js";

const close = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} not within ${eps} of ${b}`);

/** Build a PageExtract carrying only the font sizes under test. */
const page = (sizes: string[]): PageExtract => ({
  url: "https://example.com",
  breakpoint: 1280,
  colors: [],
  type: { sizes },
  spacing: { values: [] },
});

test("reduceTypeScale: empty input -> empty scale, null ratio", () => {
  const r = reduceTypeScale([]);
  assert.deepEqual(r.sizes, []);
  assert.equal(r.ratio, null);
  assert.equal(r.consistency, 0);
  assert.equal(r.unit, "px");
});

test("reduceTypeScale: parses px, sorts ascending, dedupes", () => {
  const r = reduceTypeScale([page(["24px", "16px", "16px", "32px"])]);
  assert.deepEqual(r.sizes, [16, 24, 32]);
});

test("reduceTypeScale: converts rem using default rootPx 16", () => {
  const r = reduceTypeScale([page(["1rem", "1.5rem", "2rem"])]);
  assert.deepEqual(r.sizes, [16, 24, 32]);
});

test("reduceTypeScale: honors a custom rootPx for rem", () => {
  const r = reduceTypeScale([page(["1rem", "2rem"])], 10);
  assert.deepEqual(r.sizes, [10, 20]);
});

test("reduceTypeScale: merges px and rem onto one px axis, deduped", () => {
  // 1rem == 16px and 1.5rem == 24px -> collapse with the px observations.
  const r = reduceTypeScale([page(["16px", "1rem", "24px", "1.5rem"])]);
  assert.deepEqual(r.sizes, [16, 24]);
});

test("reduceTypeScale: flattens sizes across multiple pages", () => {
  const r = reduceTypeScale([page(["12px", "16px"]), page(["16px", "20px"])]);
  assert.deepEqual(r.sizes, [12, 16, 20]);
});

test("reduceTypeScale: rounds to 2dp", () => {
  const r = reduceTypeScale([page(["0.333rem", "1rem"])]);
  // 0.333 * 16 = 5.328 -> 5.33
  assert.deepEqual(r.sizes, [5.33, 16]);
});

test("reduceTypeScale: drops unparseable / unsupported values", () => {
  const r = reduceTypeScale([
    page(["16px", "inherit", "100%", "2em", "1.5rem", "auto"]),
  ]);
  // em and % are not supported; only px and rem survive.
  assert.deepEqual(r.sizes, [16, 24]);
});

test("reduceTypeScale: single size -> null ratio, zero consistency", () => {
  const r = reduceTypeScale([page(["16px", "16px"])]);
  assert.deepEqual(r.sizes, [16]);
  assert.equal(r.ratio, null);
  assert.equal(r.consistency, 0);
});

test("reduceTypeScale: clean modular scale reports its ratio", () => {
  // Major-third 1.25 scale: 16, 20, 25, 31.25, 39.0625.
  const r = reduceTypeScale([page(["16px", "20px", "25px", "31.25px"])]);
  assert.deepEqual(r.sizes, [16, 20, 25, 31.25]);
  assert.ok(r.ratio !== null);
  close(r.ratio as number, 1.25, 1e-9);
  assert.equal(r.consistency, 1);
});

test("reduceTypeScale: tolerant ratio still holds within +/-0.04", () => {
  // ~1.5 perfect-fifth with minor wobble; medians near 1.5, all within band.
  const r = reduceTypeScale([page(["16px", "24px", "36px", "54px"])]);
  assert.ok(r.ratio !== null);
  close(r.ratio as number, 1.5, 1e-9);
  assert.equal(r.consistency, 1);
});

test("reduceTypeScale: mixed ratios -> reports median or null, honest consistency", () => {
  // Steps: 12->14 (1.167), 14->28 (2.0), 28->30 (1.071). Median ratio 1.167,
  // only its own pair agrees -> 1/3 consistency, below the required majority.
  const r = reduceTypeScale([page(["12px", "14px", "28px", "30px"])]);
  assert.deepEqual(r.sizes, [12, 14, 28, 30]);
  assert.equal(r.ratio, null);
  close(r.consistency, 1 / 3);
});

test("reduceTypeScale: never snaps sizes to the detected ratio", () => {
  // Slightly irregular but ratio-detectable; sizes stay verbatim.
  const r = reduceTypeScale([page(["16px", "20px", "25px", "30px"])]);
  // 30 is not 25*1.25 (=31.25), so it must remain 30, not be snapped.
  assert.deepEqual(r.sizes, [16, 20, 25, 30]);
});

test("reduceTypeScale: monotonically shrinking input still yields ratio > 1", () => {
  // Same set regardless of declared order; sorted ascending drives ratios > 1.
  const r = reduceTypeScale([page(["31.25px", "25px", "20px", "16px"])]);
  assert.ok(r.ratio !== null);
  close(r.ratio as number, 1.25, 1e-9);
});
