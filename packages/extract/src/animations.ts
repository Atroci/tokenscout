// CSS animation tokens: the statically-tractable part of motion. We read the
// computed transition/animation longhands plus the @keyframes names actually
// defined in the page's stylesheets. The browser-side collector is a
// self-contained function (it runs inside the page). Normalization is delegated
// to reduceAnimationTokens() so it stays testable without a browser.
//
// Scope note: this is CSS only. Lottie, JS-library detection, screencast, and
// WAAPI/rAF instrumentation are out of scope (locked decision: CSS-only
// animation capture).

import type { Page } from "playwright";

/**
 * Raw, un-normalized animation values collected from one rendered page.
 * Durations and easings are verbatim CSS strings (one entry per occurrence,
 * possibly comma-joined when a shorthand declares several). Keyframe names are
 * the @keyframes identifiers found across same-origin stylesheets.
 */
export interface RawAnimations {
  /** Verbatim transition-duration + animation-duration strings, e.g. "0.3s", "300ms", "0.2s, 0.4s". */
  durations: string[];
  /** Verbatim timing-function strings, e.g. "ease", "cubic-bezier(0.4, 0, 0.2, 1)". */
  easings: string[];
  /** @keyframes names defined in reachable stylesheets, e.g. "spin", "fade-in". */
  keyframes: string[];
}

/** Normalized, de-duplicated CSS animation tokens for one page. */
export interface AnimationTokens {
  /** Durations in milliseconds, ascending, de-duplicated. */
  durations: number[];
  /** Timing functions (easings), sorted, de-duplicated, verbatim. */
  easings: string[];
  /** @keyframes names, sorted, de-duplicated. */
  keyframes: string[];
}

/** CSS timing-function keywords that carry no design signal on their own. */
const NOOP_EASINGS = new Set(["ease", "linear", "initial", "inherit", "unset"]);

/**
 * Parse one CSS time token to milliseconds. Accepts "0.3s", "300ms", "0s".
 * Returns null for values that are not a finite time (so callers can drop them).
 */
function parseTimeToMs(token: string): number | null {
  const t = token.trim().toLowerCase();
  if (t.endsWith("ms")) {
    const n = parseFloat(t.slice(0, -2));
    return Number.isFinite(n) ? n : null;
  }
  if (t.endsWith("s")) {
    const n = parseFloat(t.slice(0, -1));
    return Number.isFinite(n) ? n * 1000 : null;
  }
  return null;
}

/**
 * Normalize raw animation values into AnimationTokens. Durations parse to ms
 * (zero is dropped as a no-op), easings de-duplicate verbatim (cubic-bezier and
 * steps preserved exactly), and keyframe names de-duplicate. A shorthand value
 * can carry several comma-separated entries (e.g. "0.2s, 0.4s"), so each raw
 * string is split on commas before parsing.
 */
export function reduceAnimationTokens(raw: RawAnimations): AnimationTokens {
  const durationsMs = new Set<number>();
  for (const entry of raw.durations) {
    for (const part of entry.split(",")) {
      const ms = parseTimeToMs(part);
      // Drop unparseable values and 0ms no-ops (no observable motion).
      if (ms !== null && ms > 0) durationsMs.add(ms);
    }
  }

  const easings = new Set<string>();
  for (const entry of raw.easings) {
    for (const part of entry.split(/,(?![^()]*\))/)) {
      // Split on commas, but not commas inside cubic-bezier()/steps() args.
      const e = part.trim();
      if (e && !NOOP_EASINGS.has(e.toLowerCase())) easings.add(e);
    }
  }

  const keyframes = new Set<string>();
  for (const name of raw.keyframes) {
    const n = name.trim();
    if (n) keyframes.add(n);
  }

  return {
    durations: [...durationsMs].sort((a, b) => a - b),
    easings: [...easings].sort(),
    keyframes: [...keyframes].sort(),
  };
}

/** Runs in the browser. Reads computed transition/animation longhands and @keyframes names. */
function collectAnimations(): RawAnimations {
  const durations: string[] = [];
  const easings: string[] = [];
  const keyframes = new Set<string>();

  for (const el of Array.from(document.querySelectorAll("*"))) {
    const cs = getComputedStyle(el);

    // Transitions: keep duration/timing only when an actual property is set.
    const tProp = cs.transitionProperty;
    if (tProp && tProp !== "none" && tProp !== "all") {
      if (cs.transitionDuration) durations.push(cs.transitionDuration);
      if (cs.transitionTimingFunction)
        easings.push(cs.transitionTimingFunction);
    }

    // Animations: keep duration/timing only when a named keyframes set is used.
    const aName = cs.animationName;
    if (aName && aName !== "none") {
      if (cs.animationDuration) durations.push(cs.animationDuration);
      if (cs.animationTimingFunction) easings.push(cs.animationTimingFunction);
    }
  }

  // @keyframes names from reachable stylesheets. Cross-origin sheets throw on
  // cssRules access (the browser blocks it), so each sheet is guarded.
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin or otherwise inaccessible sheet: skip it.
      continue;
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      // CSSRule.KEYFRAMES_RULE === 7. Use the name when present.
      if (rule.type === 7) {
        const name = (rule as CSSKeyframesRule).name;
        if (name) keyframes.add(name);
      }
    }
  }

  return { durations, easings, keyframes: [...keyframes] };
}

/** Collect CSS animation tokens from the page currently loaded in `page`. */
export async function extractAnimations(page: Page): Promise<AnimationTokens> {
  const raw = await page.evaluate(collectAnimations);
  return reduceAnimationTokens(raw);
}
