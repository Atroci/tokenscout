// Tier-3, EXPERIMENTAL: capture JS-driven motion by wrapping the Web Animations
// API. A pre-load init script replaces Element.prototype.animate so every
// `.animate(keyframes, options)` call (whatever library issued it) is recorded;
// after the page settles we read the records and reduce them to motion tokens.
//
// Motion is fired three ways before we read the store: page load (entrance
// animations), auto-scroll (reveal-on-scroll), and — crucially — INTERACTION.
// Framer Motion `whileHover`/`whileTap` and similar gestures only issue their
// `.animate()` calls when a real pointer enters the element, so a load+scroll
// capture misses every hover effect (e.g. a hero image that brightens on hover).
// We hover a bounded sample of interactive elements with the real Playwright
// pointer (synthetic events do not fire libraries that gate on `isTrusted`).
//
// This is fragile by nature (research tier): it only sees WAAPI animations, not
// rAF-driven style mutation, and per-site tuning of the settle/scroll is
// expected. The pure reducer is unit-tested; the capture is smoke-tested.

import type { Page } from "playwright";
import { normalizeEasing } from "./animations.js";

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
  /**
   * Hover interactive elements with the real pointer to trigger gesture-driven
   * motion (`whileHover` etc.). Defaults to true — this is what captures hover
   * animations that load+scroll alone never fire.
   */
  interact?: boolean;
  /**
   * Cap on how many elements are hovered when `interact` is on. Bounds wall
   * clock on large pages; the cap is sampled in DOM order, interactive-first.
   * Defaults to 24.
   */
  maxInteractTargets?: number;
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
    if (r.easing) easings.add(normalizeEasing(r.easing));
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
 * Hover a bounded sample of interactive elements with the REAL pointer so
 * gesture-driven motion (`whileHover` etc.) fires. Candidates are tagged in the
 * page (interactive tags + anything with `cursor: pointer`, the generic
 * "hoverable" signal), then each is scrolled into view and hovered via the real
 * mouse — synthetic pointer events are ignored by libraries that gate on
 * `event.isTrusted` (verified against Framer Motion). Returns how many elements
 * were actually hovered. The captured `.animate()` calls land in the WAAPI store.
 */
async function triggerHovers(page: Page, max: number): Promise<number> {
  const tagged = await page.evaluate((cap) => {
    const SELECTOR =
      'a,button,[role="button"],img,[data-framer-name],[data-framer-component-type]';
    const candidates = new Set<Element>();
    for (const el of Array.from(document.querySelectorAll(SELECTOR)))
      candidates.add(el);
    for (const el of Array.from(document.querySelectorAll("*")))
      if (getComputedStyle(el).cursor === "pointer") candidates.add(el);

    let n = 0;
    const centers: Array<[number, number]> = [];
    for (const el of Array.from(candidates)) {
      const r = el.getBoundingClientRect();
      if (r.width < 12 || r.height < 12) continue;
      const cx = r.left + r.width / 2;
      const cy = window.scrollY + r.top + r.height / 2;
      // Sample a cluster of near-identical tiles once, not N times.
      if (
        centers.some(([x, y]) => Math.abs(x - cx) < 24 && Math.abs(y - cy) < 24)
      )
        continue;
      centers.push([cx, cy]);
      el.setAttribute("data-tokenscout-hover", String(n));
      if (++n >= cap) break;
    }
    return n;
  }, max);

  let hovered = 0;
  for (let i = 0; i < tagged; i++) {
    const handle = await page.$(`[data-tokenscout-hover="${i}"]`);
    if (!handle) continue;
    try {
      await handle.scrollIntoViewIfNeeded({ timeout: 1000 });
      const box = await handle.boundingBox();
      if (box && box.width >= 8 && box.height >= 8) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(120); // let the gesture's .animate() fire
        hovered++;
      }
    } catch {
      // Element not actionable (covered, detached, off-canvas): skip it.
    } finally {
      await handle.dispose();
    }
  }
  // Move the pointer away so leave gestures fire, then strip the markers.
  await page.mouse.move(2, 2).catch(() => {});
  await page
    .evaluate(() => {
      for (const el of Array.from(
        document.querySelectorAll("[data-tokenscout-hover]"),
      ))
        el.removeAttribute("data-tokenscout-hover");
    })
    .catch(() => {});
  return hovered;
}

/**
 * Capture JS-driven motion from `url`. Installs the WAAPI hook before
 * navigation, loads the page, optionally scrolls and hovers interactive
 * elements (to fire gesture motion), waits for animations to fire, then reduces
 * the captured calls. Experimental: WAAPI only.
 */
export async function captureMotion(
  page: Page,
  url: string,
  options: CaptureMotionOptions = {},
): Promise<MotionTimelines> {
  const {
    settleMs = 800,
    scroll = true,
    interact = true,
    maxInteractTargets = 24,
  } = options;

  await page.addInitScript(WAAPI_INIT_SCRIPT);
  await page.goto(url, { waitUntil: "load" });
  if (scroll) await autoScroll(page);
  if (interact) await triggerHovers(page, maxInteractTargets);
  await page.waitForTimeout(settleMs);

  const records = (await page.evaluate(
    () =>
      (window as unknown as { __tokenscout_waapi__?: WaapiRecord[] })
        .__tokenscout_waapi__ ?? [],
  )) as WaapiRecord[];

  return reduceWaapiTimelines(records);
}
