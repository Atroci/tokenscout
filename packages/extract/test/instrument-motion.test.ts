// Pure tests for reduceWaapiTimelines (no browser). Run via tsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceWaapiTimelines } from "../src/instrument-motion.js";
import type { WaapiRecord } from "../src/instrument-motion.js";

const rec = (over: Partial<WaapiRecord>): WaapiRecord => ({
  duration: null,
  easing: null,
  delay: 0,
  iterations: null,
  properties: [],
  ...over,
});

test("reduceWaapiTimelines: durations deduped, sorted, non-positive dropped", () => {
  const r = reduceWaapiTimelines([
    rec({ duration: 400 }),
    rec({ duration: 250 }),
    rec({ duration: 400 }),
    rec({ duration: 0 }),
    rec({ duration: null }),
  ]);
  assert.deepEqual(r.durations, [250, 400]);
  assert.equal(r.count, 5);
});

test("reduceWaapiTimelines: easings collected, null skipped, sorted unique", () => {
  const r = reduceWaapiTimelines([
    rec({ easing: "ease-out" }),
    rec({ easing: "cubic-bezier(0.4, 0, 0.2, 1)" }),
    rec({ easing: "ease-out" }),
    rec({ easing: null }),
  ]);
  assert.deepEqual(r.easings, ["cubic-bezier(0.4, 0, 0.2, 1)", "ease-out"]);
});

test("reduceWaapiTimelines: properties are unioned and sorted", () => {
  const r = reduceWaapiTimelines([
    rec({ properties: ["opacity", "transform"] }),
    rec({ properties: ["transform", "filter"] }),
  ]);
  assert.deepEqual(r.properties, ["filter", "opacity", "transform"]);
});

test("reduceWaapiTimelines: empty input is an empty, zero-count report", () => {
  assert.deepEqual(reduceWaapiTimelines([]), {
    count: 0,
    durations: [],
    easings: [],
    properties: [],
  });
});

test("reduceWaapiTimelines: baked linear() springs collapse to one token", () => {
  const r = reduceWaapiTimelines([
    rec({ easing: "linear(0, 0.0212, 0.0705, 0.13, 1)" }),
    rec({ easing: "linear(0, 0.5, 1)" }),
    rec({ easing: "ease-out" }),
  ]);
  // Two different 60-stop springs would otherwise be two noisy distinct tokens.
  assert.deepEqual(r.easings, ["ease-out", "linear()"]);
});
