// Pure normalization tests for reduceAnimationTokens(). No browser. Run via tsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceAnimationTokens } from "../src/animations.js";

test("reduceAnimationTokens: parses s and ms to ascending ms, de-duplicated", () => {
  const tokens = reduceAnimationTokens({
    durations: ["0.3s", "300ms", "0.2s", "1s", "150ms"],
    easings: [],
    keyframes: [],
  });
  // 0.3s and 300ms collapse to the same 300. Sorted ascending.
  assert.deepEqual(tokens.durations, [150, 200, 300, 1000]);
});

test("reduceAnimationTokens: drops 0s/0ms no-ops and unparseable values", () => {
  const tokens = reduceAnimationTokens({
    durations: ["0s", "0ms", "", "all", "0.5s"],
    easings: [],
    keyframes: [],
  });
  assert.deepEqual(tokens.durations, [500]);
});

test("reduceAnimationTokens: splits comma-joined shorthand durations", () => {
  const tokens = reduceAnimationTokens({
    durations: ["0.2s, 0.4s", "200ms"],
    easings: [],
    keyframes: [],
  });
  // 0.2s and 200ms collapse to 200; 0.4s -> 400.
  assert.deepEqual(tokens.durations, [200, 400]);
});

test("reduceAnimationTokens: drops bare-keyword easings, keeps custom ones, sorted", () => {
  const tokens = reduceAnimationTokens({
    durations: [],
    easings: ["ease", "linear", "ease-in-out", "ease-in", "ease-in-out"],
    keyframes: [],
  });
  // ease/linear dropped as no-ops; the rest deduped and sorted.
  assert.deepEqual(tokens.easings, ["ease-in", "ease-in-out"]);
});

test("reduceAnimationTokens: preserves cubic-bezier verbatim, does not split its inner commas", () => {
  const tokens = reduceAnimationTokens({
    durations: [],
    easings: [
      "cubic-bezier(0.4, 0, 0.2, 1)",
      "cubic-bezier(0.4, 0, 0.2, 1)",
      "ease-out",
    ],
    keyframes: [],
  });
  assert.deepEqual(tokens.easings, [
    "cubic-bezier(0.4, 0, 0.2, 1)",
    "ease-out",
  ]);
});

test("reduceAnimationTokens: splits a comma-joined easing shorthand without breaking cubic-bezier", () => {
  const tokens = reduceAnimationTokens({
    durations: [],
    easings: ["ease-in, cubic-bezier(0.25, 0.1, 0.25, 1)"],
    keyframes: [],
  });
  assert.deepEqual(tokens.easings, [
    "cubic-bezier(0.25, 0.1, 0.25, 1)",
    "ease-in",
  ]);
});

test("reduceAnimationTokens: preserves steps() easing verbatim", () => {
  const tokens = reduceAnimationTokens({
    durations: [],
    easings: ["steps(4, end)", "steps(4, end)"],
    keyframes: [],
  });
  assert.deepEqual(tokens.easings, ["steps(4, end)"]);
});

test("reduceAnimationTokens: de-duplicates and sorts keyframe names, trims, drops empty", () => {
  const tokens = reduceAnimationTokens({
    durations: [],
    easings: [],
    keyframes: ["spin", "fade-in", "spin", "  pulse  ", ""],
  });
  assert.deepEqual(tokens.keyframes, ["fade-in", "pulse", "spin"]);
});

test("reduceAnimationTokens: empty input yields empty arrays", () => {
  const tokens = reduceAnimationTokens({
    durations: [],
    easings: [],
    keyframes: [],
  });
  assert.deepEqual(tokens, {
    durations: [],
    easings: [],
    keyframes: [],
    properties: { composited: [], paint: [], layout: [] },
    reducedMotion: { declared: false, gap: false },
  });
});

test("reduceAnimationTokens: flags a coverage gap when motion has no reduced-motion guard", () => {
  const tokens = reduceAnimationTokens({
    durations: ["0.3s"],
    easings: [],
    keyframes: [],
    properties: ["transform"],
    reducedMotionDeclared: false,
  });
  assert.deepEqual(tokens.reducedMotion, { declared: false, gap: true });
});

test("reduceAnimationTokens: no gap when a reduced-motion guard is declared", () => {
  const tokens = reduceAnimationTokens({
    durations: ["0.3s"],
    easings: [],
    keyframes: [],
    properties: ["transform"],
    reducedMotionDeclared: true,
  });
  assert.deepEqual(tokens.reducedMotion, { declared: true, gap: false });
});

test("reduceAnimationTokens: no gap when the page has no motion (unused keyframes don't count)", () => {
  const tokens = reduceAnimationTokens({
    durations: [],
    easings: [],
    keyframes: ["spin"],
    reducedMotionDeclared: false,
  });
  assert.deepEqual(tokens.reducedMotion, { declared: false, gap: false });
});

test("reduceAnimationTokens: classifies animated properties by render cost", () => {
  const tokens = reduceAnimationTokens({
    durations: [],
    easings: [],
    keyframes: [],
    properties: ["transform", "opacity", "width", "top", "color", "box-shadow"],
  });
  // transform/opacity composite; width/top force layout; color/box-shadow paint.
  assert.deepEqual(tokens.properties, {
    composited: ["opacity", "transform"],
    paint: ["box-shadow", "color"],
    layout: ["top", "width"],
  });
});

test("reduceAnimationTokens: de-dupes, lower-cases, and strips vendor prefixes", () => {
  const tokens = reduceAnimationTokens({
    durations: [],
    easings: [],
    keyframes: [],
    properties: ["Transform", "-webkit-transform", "transform", "MARGIN-TOP"],
  });
  assert.deepEqual(tokens.properties, {
    composited: ["transform"],
    paint: [],
    layout: ["margin-top"],
  });
});

test("reduceAnimationTokens: ignores no-op property keywords (all/none/blank)", () => {
  const tokens = reduceAnimationTokens({
    durations: [],
    easings: [],
    keyframes: [],
    properties: ["all", "none", "", "  ", "opacity"],
  });
  assert.deepEqual(tokens.properties, {
    composited: ["opacity"],
    paint: [],
    layout: [],
  });
});

test("reduceAnimationTokens: unknown properties default to paint, not layout", () => {
  const tokens = reduceAnimationTokens({
    durations: [],
    easings: [],
    keyframes: [],
    properties: ["clip-path", "--custom-prop"],
  });
  assert.deepEqual(tokens.properties, {
    composited: [],
    paint: ["--custom-prop", "clip-path"],
    layout: [],
  });
});
