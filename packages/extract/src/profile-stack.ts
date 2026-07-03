// Tech-stack profiling. Collect fingerprint signals from a rendered page, then
// map them to detected frameworks. The browser-side collector is self-contained
// (it runs inside the page). Mapping is delegated to profileStack() so it stays
// testable without a browser, the same split harvest.ts uses.

import type { Page } from "playwright";

/** Raw, un-interpreted fingerprint signals gathered from one rendered page. */
export interface RawStackSignals {
  /** Names of window globals of interest that were present (e.g. "React", "Shopify"). */
  globals: string[];
  /** Content of <meta name="generator">, or null when absent. */
  generator: string | null;
  /** All <script src> URLs, verbatim. */
  scriptSrcs: string[];
  /** DOM marker selectors/attributes that matched (e.g. "#__next", "ng-version"). */
  domMarkers: string[];
  /** ng-version attribute value if present (Angular emits its version here). */
  ngVersion: string | null;
  /** Count of distinct class names matching a CSS-Modules hash pattern (e.g. "Button_root__a1B2c"). */
  cssModulesClassCount: number;
}

/** Confidence in a single framework detection. "high" needs a definitive marker. */
export type Confidence = "high" | "medium";

/** One detected framework and how sure we are. */
export interface FrameworkHit {
  name: string;
  confidence: Confidence;
}

/** The interpreted fingerprint: which frameworks, the generator, and why. */
export interface StackProfile {
  /** Detected frameworks, de-duplicated by name and sorted by name. */
  frameworks: FrameworkHit[];
  /** <meta name="generator"> content, or null. */
  generator: string | null;
  /** Human-readable signals that drove the detections, in match order. */
  evidence: string[];
}

/** Window globals worth probing for. Presence only, never their values. */
const GLOBALS_OF_INTEREST = [
  "React",
  "ReactDOM",
  "Vue",
  "__NUXT__",
  "__NEXT_DATA__",
  "ng",
  "Shopify",
  "wp",
  "__remixContext",
  "___gatsby",
  "__SVELTEKIT_PAYLOAD__",
];

/**
 * Map raw signals to detected frameworks. Pure: no browser, no network. A
 * detection is "high" when a definitive marker is present (a framework-owned
 * global, hydration root, or version attribute), "medium" when the evidence is
 * only suggestive (a library global that a host page could also pull in, or a
 * script-URL substring). Frameworks are de-duplicated by name (keeping the
 * strongest confidence seen) and sorted by name.
 */
export function profileStack(signals: RawStackSignals): StackProfile {
  const globals = new Set(signals.globals);
  const markers = new Set(signals.domMarkers);
  const srcs = signals.scriptSrcs;
  const gen = (signals.generator ?? "").toLowerCase();

  const evidence: string[] = [];
  // Track the best confidence seen per framework as detections accumulate.
  const best = new Map<string, Confidence>();

  const note = (msg: string): void => {
    if (!evidence.includes(msg)) evidence.push(msg);
  };
  const hit = (name: string, confidence: Confidence, why: string): void => {
    note(why);
    const prior = best.get(name);
    // "high" wins over "medium"; otherwise keep what we have.
    if (prior !== "high") best.set(name, confidence);
  };

  const srcMatches = (needle: string): boolean =>
    srcs.some((s) => s.includes(needle));

  // Next.js: __NEXT_DATA__ or #__next is definitive, but both are Pages-Router
  // markers only — the App Router renders neither. A /_next/static/ script src
  // is emitted by both routers, so it's the one signal that holds across both.
  if (globals.has("__NEXT_DATA__")) {
    hit("Next.js", "high", "window.__NEXT_DATA__ present");
    hit("React", "high", "Next.js implies React");
  }
  if (markers.has("#__next")) {
    hit("Next.js", "high", "#__next hydration root present");
    hit("React", "high", "Next.js implies React");
  }
  if (srcMatches("/_next/static/")) {
    hit("Next.js", "high", "script src references /_next/static/");
    hit("React", "high", "Next.js implies React");
  }

  // Nuxt: __NUXT__ global is definitive. Vue rides along (Nuxt is Vue).
  if (globals.has("__NUXT__")) {
    hit("Nuxt", "high", "window.__NUXT__ present");
    hit("Vue", "high", "Nuxt implies Vue");
  }

  // Gatsby: the ___gatsby root global is definitive. React rides along.
  if (globals.has("___gatsby")) {
    hit("Gatsby", "high", "window.___gatsby present");
    hit("React", "high", "Gatsby implies React");
  }
  if (srcMatches("gatsby")) {
    hit("Gatsby", "medium", "script src references gatsby");
  }

  // Angular: ng-version attribute is definitive. The bare `ng` global is weaker.
  if (signals.ngVersion) {
    hit(
      "Angular",
      "high",
      `ng-version="${signals.ngVersion}" attribute present`,
    );
  } else if (markers.has("ng-version")) {
    hit("Angular", "high", "ng-version attribute present");
  } else if (globals.has("ng")) {
    hit("Angular", "medium", "window.ng present");
  }

  // SvelteKit / Svelte: the payload global is definitive for SvelteKit; the
  // data-server-rendered marker or script-URL hint is medium for Svelte.
  if (globals.has("__SVELTEKIT_PAYLOAD__")) {
    hit("SvelteKit", "high", "window.__SVELTEKIT_PAYLOAD__ present");
    hit("Svelte", "high", "SvelteKit implies Svelte");
  }
  if (srcMatches("svelte")) {
    hit("Svelte", "medium", "script src references svelte");
  }

  // Vue (standalone): the global or a data-server-rendered SSR marker. Skip the
  // medium bump if Nuxt already proved Vue at high confidence.
  if (globals.has("Vue")) {
    hit("Vue", "medium", "window.Vue present");
  }
  if (markers.has("[data-server-rendered]")) {
    hit("Vue", "medium", "[data-server-rendered] SSR marker present");
  }

  // React (standalone): globals or a data-reactroot marker. Definitive only via
  // the legacy data-reactroot attribute; globals alone are medium.
  if (markers.has("[data-reactroot]")) {
    hit("React", "high", "[data-reactroot] hydration marker present");
  }
  if (globals.has("React") || globals.has("ReactDOM")) {
    hit("React", "medium", "window.React/ReactDOM present");
  }

  // WordPress: generator string is definitive; /wp-content/ or /wp-json/ in any
  // script URL is also definitive; the `wp` global alone is medium.
  if (gen.includes("wordpress")) {
    hit(
      "WordPress",
      "high",
      `generator names WordPress: "${signals.generator}"`,
    );
  }
  if (srcMatches("/wp-content/") || srcMatches("/wp-json/")) {
    hit("WordPress", "high", "script src references /wp-content/ or /wp-json/");
  }
  if (globals.has("wp")) {
    hit("WordPress", "medium", "window.wp present");
  }

  // Shopify: the Shopify global or a cdn.shopify.com script URL is definitive.
  if (globals.has("Shopify")) {
    hit("Shopify", "high", "window.Shopify present");
  }
  if (srcMatches("cdn.shopify.com") || srcMatches("shopifycdn")) {
    hit("Shopify", "high", "script src references the Shopify CDN");
  }

  // CSS Modules: bundlers rewrite class names to `<name>_<local>__<hash>` (or
  // `_<local>_<hash>_<n>` for Vite). A handful of distinct matches is a strong
  // fingerprint even when no JS framework marker fired (e.g. React apps with
  // no SSR hydration root, or a build tool profileStack doesn't otherwise know).
  if (signals.cssModulesClassCount >= 3) {
    hit(
      "CSS Modules",
      "medium",
      `${signals.cssModulesClassCount} class names match the CSS-Modules hash pattern`,
    );
  }

  const frameworks: FrameworkHit[] = [...best.entries()]
    .map(([name, confidence]) => ({ name, confidence }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { frameworks, generator: signals.generator, evidence };
}

/**
 * Runs in the browser. Probes for window globals, the generator meta tag,
 * script URLs, and DOM markers. Cannot reference module scope: it is serialized
 * into the page. `interest` is passed in because the global list lives outside.
 */
function collectSignals(interest: string[]): RawStackSignals {
  const w = window as unknown as Record<string, unknown>;
  const globals = interest.filter((name) => w[name] !== undefined);

  const genMeta = document.querySelector('meta[name="generator"]');
  const generator = genMeta ? genMeta.getAttribute("content") : null;

  const scriptSrcs = Array.from(document.querySelectorAll("script[src]")).map(
    (s) => (s as HTMLScriptElement).src,
  );

  // Probe each DOM marker independently so evidence stays specific.
  const domMarkers: string[] = [];
  const markerSelectors = [
    "[data-reactroot]",
    "#__next",
    "[data-server-rendered]",
  ];
  for (const sel of markerSelectors) {
    if (document.querySelector(sel)) domMarkers.push(sel);
  }

  // ng-version is an attribute on the app root, not a selectable id/class.
  const ngEl = document.querySelector("[ng-version]");
  const ngVersion = ngEl ? ngEl.getAttribute("ng-version") : null;
  if (ngVersion) domMarkers.push("ng-version");

  // CSS Modules class-name fingerprint: `Button_root__a1B2c` (webpack/Next) or
  // `_button_1a2b3_1` (Vite). Count distinct matches across all elements.
  const CSS_MODULES_RE = /^([A-Za-z0-9-]+_[A-Za-z0-9-]+__[a-zA-Z0-9]{4,8}|_[a-z0-9-]+_[a-z0-9]{4,8}_\d+)$/;
  const cssModulesClasses = new Set<string>();
  for (const el of Array.from(document.querySelectorAll("[class]"))) {
    for (const cls of Array.from(el.classList)) {
      if (CSS_MODULES_RE.test(cls)) cssModulesClasses.add(cls);
    }
  }

  return {
    globals,
    generator,
    scriptSrcs,
    domMarkers,
    ngVersion,
    cssModulesClassCount: cssModulesClasses.size,
  };
}

/** Load nothing new: profile the page already open in `page`. */
export async function profilePage(page: Page): Promise<StackProfile> {
  const signals = await page.evaluate(collectSignals, GLOBALS_OF_INTEREST);
  return profileStack(signals);
}
