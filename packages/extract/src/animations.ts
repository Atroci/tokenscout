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
  /**
   * Verbatim animated property names — transition-property entries plus the
   * properties mutated inside @keyframes that are actually applied to an
   * element. One entry per occurrence. Optional so hand-built fixtures stay
   * terse; the browser collector always provides it.
   */
  properties?: string[];
  /**
   * Whether the page declares a `@media (prefers-reduced-motion: ...)` guard in
   * any reachable stylesheet. Optional for hand-built fixtures; the browser
   * collector always provides it.
   */
  reducedMotionDeclared?: boolean;
}

/**
 * Animated properties grouped by render cost, per the web.dev high-performance
 * -animation taxonomy: only compositor-only properties (transform/opacity) stay
 * off the main thread. Animating paint — and especially layout — properties
 * drops frames, so surfacing them is the performance-smell signal.
 */
export interface AnimatedProperties {
  /** Compositor-only — cheap to animate (transform, opacity, filter, ...). */
  composited: string[];
  /** Animating these forces a repaint each frame (color, box-shadow, ...). */
  paint: string[];
  /** Animating these forces a layout/reflow each frame (width, top, margin, ...). The worst smell. */
  layout: string[];
}

/**
 * Reduced-motion accessibility coverage (WCAG 2.3.3 "Animation from
 * Interactions"; the `@media (prefers-reduced-motion: reduce)` query is
 * sufficient technique C39). This is a coverage signal, not a hard conformance
 * verdict — a declared guard is not proof every animation actually backs off.
 */
export interface ReducedMotionCoverage {
  /** A `@media (prefers-reduced-motion: ...)` guard is declared somewhere. */
  declared: boolean;
  /** The page animates but declares no reduced-motion guard — a coverage gap. */
  gap: boolean;
}

/** Normalized, de-duplicated CSS animation tokens for one page. */
export interface AnimationTokens {
  /** Durations in milliseconds, ascending, de-duplicated. */
  durations: number[];
  /** Timing functions (easings), sorted, de-duplicated, verbatim. */
  easings: string[];
  /** @keyframes names, sorted, de-duplicated. */
  keyframes: string[];
  /** Animated properties classified by render cost (performance smells). */
  properties: AnimatedProperties;
  /** Reduced-motion accessibility coverage (WCAG 2.3.3). */
  reducedMotion: ReducedMotionCoverage;
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
 * Compositor-only properties — the only ones web.dev recommends animating, since
 * they stay off the main thread ("restrict animations to opacity and transform").
 * filter/backdrop-filter and the individual transform longhands also composite.
 */
const COMPOSITED = new Set([
  "transform",
  "opacity",
  "translate",
  "rotate",
  "scale",
  "filter",
  "backdrop-filter",
]);

/**
 * Properties whose animation forces a layout (reflow) every frame — the
 * high-severity smell (web.dev: ~50% dropped frames for top/left vs ~1% for
 * transform). Shorthands and longhands are both listed because @keyframes steps
 * can serialize either. Anything not in COMPOSITED or here falls through to
 * "paint" (a repaint — milder than a reflow, but still off the compositor).
 */
const TRIGGERS_LAYOUT = new Set([
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "inline-size",
  "block-size",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-width",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "font-size",
  "line-height",
  "font-weight",
  "letter-spacing",
  "word-spacing",
  "vertical-align",
  "flex",
  "flex-basis",
  "flex-grow",
  "flex-shrink",
  "gap",
  "row-gap",
  "column-gap",
]);

/** Animated-property keywords that carry no smell signal on their own. */
const NOOP_PROPERTIES = new Set([
  "all",
  "none",
  "initial",
  "inherit",
  "unset",
  "",
]);

/**
 * Classify animated property names into compositor / paint / layout buckets.
 * Names are lower-cased, vendor-prefix-stripped (so "-webkit-transform" reads as
 * "transform"), and de-duplicated. Unknown properties default to "paint": they
 * repaint, but we do not claim a reflow we cannot prove from the taxonomy.
 */
function classifyProperties(names: string[]): AnimatedProperties {
  const composited = new Set<string>();
  const paint = new Set<string>();
  const layout = new Set<string>();
  for (const raw of names) {
    const p = raw
      .trim()
      .toLowerCase()
      .replace(/^-(?:webkit|moz|ms|o)-/, "");
    if (NOOP_PROPERTIES.has(p)) continue;
    if (COMPOSITED.has(p)) composited.add(p);
    else if (TRIGGERS_LAYOUT.has(p)) layout.add(p);
    else paint.add(p);
  }
  return {
    composited: [...composited].sort(),
    paint: [...paint].sort(),
    layout: [...layout].sort(),
  };
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

  const durationsOut = [...durationsMs].sort((a, b) => a - b);
  const easingsOut = [...easings].sort();
  const properties = classifyProperties(raw.properties ?? []);

  // "Has motion" is judged from signals that only appear when an element really
  // transitions/animates (durations, easings, animated properties) — not from
  // @keyframes names, which can be defined but never applied.
  const hasMotion =
    durationsOut.length > 0 ||
    easingsOut.length > 0 ||
    properties.composited.length +
      properties.paint.length +
      properties.layout.length >
      0;
  const declared = raw.reducedMotionDeclared ?? false;

  return {
    durations: durationsOut,
    easings: easingsOut,
    keyframes: [...keyframes].sort(),
    properties,
    reducedMotion: { declared, gap: hasMotion && !declared },
  };
}

/** Runs in the browser. Reads computed transition/animation longhands and @keyframes names. */
function collectAnimations(): RawAnimations {
  const durations: string[] = [];
  const easings: string[] = [];
  const properties: string[] = [];
  const keyframes = new Set<string>();
  // @keyframes the page actually applies — we read their animated properties
  // below, skipping dead keyframes that no element uses.
  const usedAnimationNames = new Set<string>();
  let reducedMotionDeclared = false;

  for (const el of Array.from(document.querySelectorAll("*"))) {
    const cs = getComputedStyle(el);

    // Transitions: keep duration/timing only when an actual property is set.
    const tProp = cs.transitionProperty;
    if (tProp && tProp !== "none" && tProp !== "all") {
      if (cs.transitionDuration) durations.push(cs.transitionDuration);
      if (cs.transitionTimingFunction)
        easings.push(cs.transitionTimingFunction);
      // Each transitioned property is a performance-smell candidate.
      for (const p of tProp.split(",")) properties.push(p.trim());
    }

    // Animations: keep duration/timing only when a named keyframes set is used.
    const aName = cs.animationName;
    if (aName && aName !== "none") {
      if (cs.animationDuration) durations.push(cs.animationDuration);
      if (cs.animationTimingFunction) easings.push(cs.animationTimingFunction);
      for (const n of aName.split(",")) usedAnimationNames.add(n.trim());
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
      // A `@media (prefers-reduced-motion: ...)` guard anywhere signals the
      // author handles reduced motion (WCAG 2.3.3 / sufficient technique C39).
      // Non-media rules have no `.media`, so the guard short-circuits.
      const media = (rule as CSSMediaRule).media;
      if (media && media.mediaText.includes("prefers-reduced-motion")) {
        reducedMotionDeclared = true;
      }
      // CSSRule.KEYFRAMES_RULE === 7. Use the name when present.
      if (rule.type === 7) {
        const kf = rule as CSSKeyframesRule;
        if (!kf.name) continue;
        keyframes.add(kf.name);
        // Read animated properties only from keyframes an element applies.
        if (usedAnimationNames.has(kf.name)) {
          for (const step of Array.from(kf.cssRules)) {
            const style = (step as CSSKeyframeRule).style;
            if (!style) continue;
            for (let i = 0; i < style.length; i++) properties.push(style[i]);
          }
        }
      }
    }
  }

  return {
    durations,
    easings,
    keyframes: [...keyframes],
    properties,
    reducedMotionDeclared,
  };
}

/** Collect CSS animation tokens from the page currently loaded in `page`. */
export async function extractAnimations(page: Page): Promise<AnimationTokens> {
  const raw = await page.evaluate(collectAnimations);
  return reduceAnimationTokens(raw);
}
