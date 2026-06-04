// Tier-3, EXPERIMENTAL: capture JS-driven motion by wrapping the Web Animations
// API. A pre-load init script replaces Element.prototype.animate so every
// `.animate(keyframes, options)` call (whatever library issued it) is recorded;
// after the page settles we read the records and reduce them to motion tokens.
//
// This is fragile by nature (research tier): it only sees WAAPI animations, not
// rAF-driven style mutation, and per-site tuning of the settle/scroll is
// expected. The pure reducer is unit-tested; the capture is smoke-tested.

import type { Page } from "playwright";

/** One captured `Element.animate` call, serialized from the page. */
export interface WaapiRecord {
  /** Effect duration in ms (WAAPI is already ms), or null if not numeric. */
  duration: number | null;
  /** Easing string as passed, or null. */
  easing: string | null;
  /** Start delay in ms. */
  delay: number;
  /** Iteration count (number, or "Infinity" serialized), or null. */
  iterations: number | null;
  /** Animated CSS property names seen across the keyframes. */
  properties: string[];
}

/** Reduced JS-motion tokens captured from the Web Animations API. */
export interface MotionTimelines {
  /** Number of `Element.animate` calls captured. */
  count: number;
  /** Distinct durations in ms, ascending. */
  durations: number[];
  /** Distinct easing strings, sorted. */
  easings: string[];
  /** Union of animated CSS property names, sorted. */
  properties: string[];
}

/** Tunables for captureMotion. */
export interface CaptureMotionOptions {
  /** Milliseconds to wait after load for animations to fire. Defaults to 800. */
  settleMs?: number;
  /** Auto-scroll the page to trigger scroll-driven motion. Defaults to true. */
  scroll?: boolean;
}

// Injected before any page script. Self-contained string (not a function) so it
// is never run through the bundler. Wraps Element.prototype.animate to record
// every call, then delegates to the original.
const WAAPI_INIT_SCRIPT = `
(function () {
  var store = [];
  try { Object.defineProperty(window, "__tokenscout_waapi__", { value: store, configurable: true }); }
  catch (e) { window.__tokenscout_waapi__ = store; }
  if (!window.Element || !Element.prototype || !Element.prototype.animate) return;
  var orig = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    try {
      var duration = null, easing = null, delay = 0, iterations = null;
      if (typeof options === "number") {
        duration = options;
      } else if (options && typeof options === "object") {
        duration = typeof options.duration === "number" ? options.duration : null;
        easing = typeof options.easing === "string" ? options.easing : null;
        delay = typeof options.delay === "number" ? options.delay : 0;
        iterations = typeof options.iterations === "number" ? options.iterations : null;
      }
      var props = {};
      var frames = Array.isArray(keyframes) ? keyframes : (keyframes ? [keyframes] : []);
      for (var i = 0; i < frames.length; i++) {
        var f = frames[i];
        if (f && typeof f === "object") {
          for (var k in f) {
            if (k !== "offset" && k !== "easing" && k !== "composite") props[k] = true;
          }
        }
      }
      store.push({ duration: duration, easing: easing, delay: delay, iterations: iterations, properties: Object.keys(props) });
    } catch (e) { /* never break the page's own animation */ }
    return orig.apply(this, arguments);
  };
})();
`;

/** Reduce captured WAAPI calls into motion tokens. Pure and browser-free. */
export function reduceWaapiTimelines(records: WaapiRecord[]): MotionTimelines {
  const durations = new Set<number>();
  const easings = new Set<string>();
  const properties = new Set<string>();

  for (const r of records) {
    if (
      typeof r.duration === "number" &&
      Number.isFinite(r.duration) &&
      r.duration > 0
    ) {
      durations.add(r.duration);
    }
    if (r.easing) easings.add(r.easing);
    for (const p of r.properties) properties.add(p);
  }

  return {
    count: records.length,
    durations: [...durations].sort((a, b) => a - b),
    easings: [...easings].sort(),
    properties: [...properties].sort(),
  };
}

/** Auto-scroll the page in viewport-sized steps to trigger scroll-driven motion. */
async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let y = 0;
      const step = () => {
        window.scrollBy(0, window.innerHeight);
        y += window.innerHeight;
        if (y < document.body.scrollHeight && y < 20000) setTimeout(step, 100);
        else resolve();
      };
      step();
    });
  });
}

/**
 * Capture JS-driven motion from `url`. Installs the WAAPI hook before
 * navigation, loads the page, optionally scrolls, waits for animations to fire,
 * then reduces the captured calls. Experimental: WAAPI only.
 */
export async function captureMotion(
  page: Page,
  url: string,
  options: CaptureMotionOptions = {},
): Promise<MotionTimelines> {
  const { settleMs = 800, scroll = true } = options;

  await page.addInitScript(WAAPI_INIT_SCRIPT);
  await page.goto(url, { waitUntil: "load" });
  if (scroll) await autoScroll(page);
  await page.waitForTimeout(settleMs);

  const records = (await page.evaluate(
    () =>
      (window as unknown as { __tokenscout_waapi__?: WaapiRecord[] })
        .__tokenscout_waapi__ ?? [],
  )) as WaapiRecord[];

  return reduceWaapiTimelines(records);
}
