// Classify the primary interaction driver for a page section or element.
// The classification feeds ai-website-cloner-template so it dispatches the
// right builder (scroll-driven vs click-driven vs hover-driven, etc.).
// Pattern mirrors detect-motion.ts: RawInteractionSignals + pure interpret +
// Playwright wrapper.

import type { Page } from "playwright";

/** The primary interaction driver for a section or element. */
export type InteractionType =
  | "static" // No detectable interaction
  | "scroll-driven" // IntersectionObserver, scroll-snap, animation-timeline, sticky
  | "click-driven" // Click handlers change visible content
  | "hover-driven" // Hover/focus-visible CSS state changes
  | "time-driven"; // CSS animation, JS interval/timeout driven (no user gesture)

export type Confidence = "high" | "medium" | "low";

export interface InteractionModel {
  type: InteractionType;
  confidence: Confidence;
  /** Human-readable evidence for the detection. */
  mechanism: string;
}

/** Raw signals collected from the browser for one element/selector. */
export interface RawInteractionSignals {
  /** CSS scroll-snap-type on this element or its nearest scroll container. */
  scrollSnapType: string;
  /** CSS animation-timeline value (not 'none' means scroll-driven animation). */
  animationTimeline: string;
  /** CSS position value (sticky → scroll-driven). */
  position: string;
  /** Number of IntersectionObserver instances found in window (page-level heuristic). */
  intersectionObserverCount: number;
  /** CSS transition on hover pseudo-class (via checking transition property; true = likely hover state). */
  hasTransition: boolean;
  /** CSS animation-duration (non-zero = time-driven possible). */
  animationDuration: string;
  /** True when the element has a CSS animation-name set. */
  hasAnimation: boolean;
}

/**
 * Interpret raw signals into an interaction model. Pure and browser-free.
 * Priority order: first match wins.
 */
export function detectInteraction(
  signals: RawInteractionSignals,
): InteractionModel {
  // a. animation-timeline → scroll-driven CSS animation. "auto" is the CSS
  // initial value (use the default document timeline, i.e. time-driven, not
  // scroll-driven) — getComputedStyle() reports it for every element that
  // never set animation-timeline at all, so it must be excluded alongside
  // "none"/"" or this branch fires "high confidence" on every element on
  // every page, regardless of its actual CSS. Verified against real Chromium
  // (148.0.7778.96): a plain <header> with no animation-timeline rule reports
  // "auto", not "none".
  if (
    signals.animationTimeline !== "auto" &&
    signals.animationTimeline !== "none" &&
    signals.animationTimeline !== ""
  ) {
    return {
      type: "scroll-driven",
      confidence: "high",
      mechanism: "CSS animation-timeline",
    };
  }

  // b. scroll-snap-type → scroll-snap container
  if (signals.scrollSnapType !== "none" && signals.scrollSnapType !== "") {
    return {
      type: "scroll-driven",
      confidence: "high",
      mechanism: "CSS scroll-snap-type",
    };
  }

  // c. position:sticky → element moves with scroll
  if (signals.position === "sticky") {
    return {
      type: "scroll-driven",
      confidence: "medium",
      mechanism: "position:sticky",
    };
  }

  // d. IntersectionObserver proxy elements found → likely scroll-reveal
  if (signals.intersectionObserverCount > 0) {
    return {
      type: "scroll-driven",
      confidence: "medium",
      mechanism: "IntersectionObserver heuristic",
    };
  }

  // e. CSS animation → time-driven (auto-plays without user gesture)
  if (signals.hasAnimation) {
    return {
      type: "time-driven",
      confidence: "medium",
      mechanism: "CSS animation",
    };
  }

  // f. CSS transition → hover/focus state changes likely
  if (signals.hasTransition) {
    return {
      type: "hover-driven",
      confidence: "low",
      mechanism: "CSS transition (hover/focus likely)",
    };
  }

  // g. Nothing found → static
  return {
    type: "static",
    confidence: "high",
    mechanism: "no interaction signals",
  };
}

/** Runs in the browser. Gathers interaction signals for the given selector. */
function collectInteractionSignals(selector: string): RawInteractionSignals {
  const el = document.querySelector(selector) ?? document.body;
  const cs = getComputedStyle(el);

  const scrollSnapType = cs.scrollSnapType ?? "none";
  const animationTimeline = cs.getPropertyValue("animation-timeline") || "none";
  const position = cs.position;

  // IntersectionObserver heuristic: count elements carrying common
  // scroll-reveal markers (data-aos, data-animate, [data-inview], [class*="animate"]).
  const ioProxy = document.querySelectorAll(
    "[data-aos], [data-animate], [data-inview], [class*='animate']",
  ).length;

  const transition = cs.transition;
  const hasTransition =
    transition !== "none" &&
    transition !== "" &&
    transition !== "all 0s ease 0s";

  const animationDuration = cs.animationDuration;
  const hasAnimation = cs.animationName !== "none";

  return {
    scrollSnapType,
    animationTimeline,
    position,
    intersectionObserverCount: ioProxy,
    hasTransition,
    animationDuration,
    hasAnimation,
  };
}

/**
 * Detect the primary interaction model for `selector` on `page`.
 * Playwright wrapper around collectInteractionSignals + detectInteraction.
 */
export async function detectInteractionModel(
  page: Page,
  selector: string,
): Promise<InteractionModel> {
  const signals = await page.evaluate(collectInteractionSignals, selector);
  return detectInteraction(signals);
}
