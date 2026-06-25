// Detect JS animation libraries on a rendered page and scrape the declarative
// configs they expose. Experimental (research tier): library surfaces shift,
// so detection is best-effort. The browser-side collector is self-contained;
// interpretation lives in detectMotion() so it stays testable, the same split
// profile-stack.ts uses.

import type { Page } from "playwright";

/** Raw, un-interpreted motion-library signals gathered from one rendered page. */
export interface RawMotionSignals {
  /** Names of window globals of interest that were present (e.g. "gsap", "AOS"). */
  globals: string[];
  /** True when at least one <lottie-player> custom element is in the DOM. */
  hasLottiePlayer: boolean;
  /** Lottie source URLs found on players / data-animation-path attributes. */
  lottieSources: string[];
  /** Verbatim `data-aos` effect values found in the DOM (e.g. "fade-up"). */
  aosEffects: string[];
  /** DOM marker attributes/selectors that matched (e.g. "data-framer-name"). */
  domMarkers: string[];
  /** Detected scroll library identifiers (e.g. "lenis", "locomotive-scroll"). */
  scrollLibraries: string[];
  /** True if scroll-snap-type is set on <html> or <body>. */
  hasScrollSnap: boolean;
}

/** Confidence in a single library detection. "high" needs a definitive marker. */
export type Confidence = "high" | "medium";

/** One detected animation library. */
export interface MotionLibrary {
  name: string;
  confidence: Confidence;
}

/** Lottie usage summary. */
export interface LottieUsage {
  present: boolean;
  /** De-duplicated, sorted Lottie source references (URLs or paths). */
  sources: string[];
}

/** Declarative AOS (Animate On Scroll) usage summary. */
export interface AosUsage {
  /** Number of elements carrying a `data-aos` effect. */
  count: number;
  /** De-duplicated, sorted effect names in use (e.g. "fade-up", "zoom-in"). */
  effects: string[];
}

/** The interpreted motion report for one page. */
export interface MotionReport {
  /** Detected libraries, de-duplicated by name and sorted by name. */
  libraries: MotionLibrary[];
  lottie: LottieUsage;
  aos: AosUsage;
  /** Detected scroll libraries, de-duplicated by name and sorted by name. */
  scrollLibraries: MotionLibrary[];
  /** True if scroll-snap-type is set on <html> or <body>. */
  hasScrollSnap: boolean;
}

/**
 * Map a window global name to a known animation library and its detection
 * confidence. A framework-owned global is definitive ("high").
 */
const GLOBAL_LIBRARY: Record<string, MotionLibrary> = {
  gsap: { name: "GSAP", confidence: "high" },
  TweenMax: { name: "GSAP", confidence: "high" },
  TweenLite: { name: "GSAP", confidence: "high" },
  TimelineMax: { name: "GSAP", confidence: "high" },
  AOS: { name: "AOS", confidence: "high" },
  anime: { name: "anime.js", confidence: "high" },
  Velocity: { name: "Velocity", confidence: "high" },
  ScrollMagic: { name: "ScrollMagic", confidence: "high" },
  lottie: { name: "Lottie", confidence: "high" },
  bodymovin: { name: "Lottie", confidence: "high" },
  Motion: { name: "Motion One", confidence: "high" },
};

/**
 * Map a window global name to a known scroll library. A definitive global is
 * high confidence.
 */
const SCROLL_GLOBAL_LIBRARY: Record<string, MotionLibrary> = {
  lenis: { name: "Lenis", confidence: "high" },
  LocomotiveScroll: { name: "Locomotive Scroll", confidence: "high" },
};

/** The window globals worth probing for. Passed to the browser collector. */
export const MOTION_GLOBALS = [
  ...Object.keys(GLOBAL_LIBRARY),
  ...Object.keys(SCROLL_GLOBAL_LIBRARY),
];

/**
 * Interpret raw signals into a motion report. Pure and browser-free. Globals
 * give high-confidence library hits; declarative DOM markers add medium-
 * confidence hits when no global confirmed them (e.g. `data-aos` without the
 * AOS global, or Framer's `data-framer-*`).
 */
export function detectMotion(signals: RawMotionSignals): MotionReport {
  const byName = new Map<string, Confidence>();
  const note = (lib: MotionLibrary) => {
    // Keep the strongest confidence seen for a library.
    const prev = byName.get(lib.name);
    if (prev !== "high") byName.set(lib.name, lib.confidence);
  };

  for (const g of signals.globals) {
    const lib = GLOBAL_LIBRARY[g];
    if (lib) note(lib);
  }

  // Declarative markers: medium confidence unless a global already confirmed.
  if (signals.aosEffects.length > 0)
    note({ name: "AOS", confidence: "medium" });
  if (signals.hasLottiePlayer || signals.lottieSources.length > 0)
    note({ name: "Lottie", confidence: "medium" });
  if (signals.domMarkers.some((m) => m.startsWith("data-framer")))
    note({ name: "Framer Motion", confidence: "medium" });

  const libraries: MotionLibrary[] = [...byName.entries()]
    .map(([name, confidence]) => ({ name, confidence }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  // Scroll library detection.
  const scrollByName = new Map<string, Confidence>();
  const noteScroll = (lib: MotionLibrary) => {
    const prev = scrollByName.get(lib.name);
    if (prev !== "high") scrollByName.set(lib.name, lib.confidence);
  };

  for (const g of signals.globals) {
    const lib = SCROLL_GLOBAL_LIBRARY[g];
    if (lib) noteScroll(lib);
  }

  // DOM markers for scroll libraries: medium confidence.
  if (signals.scrollLibraries.includes("lenis"))
    noteScroll({ name: "Lenis", confidence: "high" });
  if (signals.scrollLibraries.includes("locomotive-scroll"))
    noteScroll({ name: "Locomotive Scroll", confidence: "high" });
  if (signals.domMarkers.some((m) => m === "data-locomotive-scroll"))
    noteScroll({ name: "Locomotive Scroll", confidence: "medium" });

  const scrollLibraries: MotionLibrary[] = [...scrollByName.entries()]
    .map(([name, confidence]) => ({ name, confidence }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return {
    libraries,
    lottie: {
      present: signals.hasLottiePlayer || signals.lottieSources.length > 0,
      sources: [...new Set(signals.lottieSources)].sort(),
    },
    aos: {
      count: signals.aosEffects.length,
      effects: [...new Set(signals.aosEffects)].sort(),
    },
    scrollLibraries,
    hasScrollSnap: signals.hasScrollSnap,
  };
}

/** Runs in the browser. Gathers motion-library fingerprint signals. */
function collectMotionSignals(probe: string[]): RawMotionSignals {
  const w = window as unknown as Record<string, unknown>;
  const globals = probe.filter((name) => w[name] !== undefined);

  const players = Array.from(document.querySelectorAll("lottie-player"));
  const lottieSources: string[] = [];
  for (const el of players) {
    const src = el.getAttribute("src");
    if (src) lottieSources.push(src);
  }
  for (const el of Array.from(
    document.querySelectorAll("[data-animation-path]"),
  )) {
    const path = el.getAttribute("data-animation-path");
    if (path) lottieSources.push(path);
  }

  const aosEffects: string[] = [];
  for (const el of Array.from(document.querySelectorAll("[data-aos]"))) {
    const effect = el.getAttribute("data-aos");
    if (effect) aosEffects.push(effect);
  }

  const domMarkers: string[] = [];
  if (
    document.querySelector("[data-framer-name], [data-framer-component-type]")
  )
    domMarkers.push("data-framer");
  if (document.querySelector("[data-locomotive-scroll]"))
    domMarkers.push("data-locomotive-scroll");

  // Scroll library detection.
  const scrollLibraries: string[] = [];
  if (
    w["lenis"] !== undefined ||
    document.documentElement.classList.contains("lenis")
  )
    scrollLibraries.push("lenis");
  if (
    w["LocomotiveScroll"] !== undefined ||
    document.querySelector("[data-locomotive-scroll]") !== null
  )
    scrollLibraries.push("locomotive-scroll");

  // Scroll snap detection.
  const htmlSnap = getComputedStyle(document.documentElement).scrollSnapType;
  const bodySnap = getComputedStyle(document.body).scrollSnapType;
  const hasScrollSnap =
    (htmlSnap !== "" && htmlSnap !== "none") ||
    (bodySnap !== "" && bodySnap !== "none");

  return {
    globals,
    hasLottiePlayer: players.length > 0,
    lottieSources,
    aosEffects,
    domMarkers,
    scrollLibraries,
    hasScrollSnap,
  };
}

/** Detect animation libraries on `page` (experimental, best-effort). */
export async function detectPageMotion(page: Page): Promise<MotionReport> {
  const signals = await page.evaluate(collectMotionSignals, MOTION_GLOBALS);
  return detectMotion(signals);
}
