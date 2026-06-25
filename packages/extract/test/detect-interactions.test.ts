// Pure tests for detectInteraction (no browser). Run via tsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectInteraction } from "../src/detect-interactions.js";
import type { RawInteractionSignals } from "../src/detect-interactions.js";

const empty: RawInteractionSignals = {
  scrollSnapType: "none",
  animationTimeline: "none",
  position: "static",
  intersectionObserverCount: 0,
  hasTransition: false,
  animationDuration: "0s",
  hasAnimation: false,
};

test("detectInteraction: animationTimeline set → scroll-driven high", () => {
  const r = detectInteraction({ ...empty, animationTimeline: "scroll()" });
  assert.equal(r.type, "scroll-driven");
  assert.equal(r.confidence, "high");
  assert.equal(r.mechanism, "CSS animation-timeline");
});

test("detectInteraction: scrollSnapType 'y mandatory' → scroll-driven high", () => {
  const r = detectInteraction({ ...empty, scrollSnapType: "y mandatory" });
  assert.equal(r.type, "scroll-driven");
  assert.equal(r.confidence, "high");
  assert.equal(r.mechanism, "CSS scroll-snap-type");
});

test("detectInteraction: position sticky, no snap → scroll-driven medium", () => {
  const r = detectInteraction({ ...empty, position: "sticky" });
  assert.equal(r.type, "scroll-driven");
  assert.equal(r.confidence, "medium");
  assert.equal(r.mechanism, "position:sticky");
});

test("detectInteraction: hasTransition only → hover-driven low", () => {
  const r = detectInteraction({ ...empty, hasTransition: true });
  assert.equal(r.type, "hover-driven");
  assert.equal(r.confidence, "low");
  assert.equal(r.mechanism, "CSS transition (hover/focus likely)");
});

test("detectInteraction: all empty/none → static high", () => {
  const r = detectInteraction(empty);
  assert.equal(r.type, "static");
  assert.equal(r.confidence, "high");
  assert.equal(r.mechanism, "no interaction signals");
});
