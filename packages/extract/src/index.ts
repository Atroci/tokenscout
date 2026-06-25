// @tokenscout/extract: drive a headless browser to produce the PageExtract[]
// that tokenscout's core reducers consume. Playwright is a peer dependency, so
// the consumer owns its version and installs the browser binaries.

import { chromium } from "playwright";
import { assembleTokens, type AssembleOptions } from "tokenscout/tokens";
import type { DesignTokens, PageExtract } from "tokenscout/schema";
import { discoverPages } from "./crawl.js";
import { extractPage } from "./extract-page.js";
import { discoverAssets, type AssetManifest } from "./harvest-assets.js";
import { extractAnimations, type AnimationTokens } from "./animations.js";
import { profilePage, type StackProfile } from "./profile-stack.js";
import { discoverSitemapUrls } from "./sitemap.js";

export interface ExtractOptions {
  /** Viewport widths to extract at. Defaults to [1280, 375]. */
  breakpoints?: number[];
  /** Max same-origin pages to crawl from the entry URL. Defaults to 1. */
  top?: number;
}

/**
 * Extract raw design-token observations from a live URL. Returns one
 * PageExtract per (page, breakpoint). Feed the result to the core's
 * assembleTokens, or use extractTokens() to do both in one call.
 */
export async function extractSite(
  target: string,
  options: ExtractOptions = {},
): Promise<PageExtract[]> {
  const { breakpoints = [1280, 375], top = 1 } = options;
  const browser = await chromium.launch();
  try {
    const urls = await discoverPages(browser, target, top);
    const page = await browser.newPage();
    const extracts: PageExtract[] = [];
    try {
      for (const url of urls) {
        for (const breakpoint of breakpoints) {
          extracts.push(await extractPage(page, url, breakpoint));
        }
      }
    } finally {
      await page.close();
    }
    return extracts;
  } finally {
    await browser.close();
  }
}

/** Convenience: extract a live URL straight to a DTCG token document. */
export async function extractTokens(
  target: string,
  options: ExtractOptions & AssembleOptions = {},
): Promise<DesignTokens> {
  const { breakpoints, top, ...assembleOpts } = options;
  const pages = await extractSite(target, { breakpoints, top });
  return assembleTokens(pages, assembleOpts);
}

export interface InspectOptions extends ExtractOptions {
  /** Discover pages from `<origin>/sitemap.xml` instead of crawling links. */
  sitemap?: boolean;
  /** Collect the image/asset manifest from the entry page. Defaults to true. */
  assets?: boolean;
  /** Collect CSS animation tokens from the entry page. Defaults to true. */
  animations?: boolean;
  /** Fingerprint the tech stack from the entry page. Defaults to true. */
  stack?: boolean;
  /** ΔE76 clustering threshold passed to assembleTokens. */
  deltaE?: number;
  /** Root font-size in px for rem to px conversion. */
  rootPx?: number;
}

/** Everything one inspection run yields: tokens plus the redesign-migration extras. */
export interface SiteReport {
  /** The entry URL that was inspected. */
  url: string;
  /** Raw per-(page, breakpoint) observations the tokens were reduced from. */
  pages: PageExtract[];
  /** DTCG token document. Includes a `duration` group when animations were collected. */
  tokens: DesignTokens;
  /** Image/asset manifest from the entry page (empty when assets are disabled). */
  assets: AssetManifest;
  /** CSS animation tokens from the entry page (empty when animations are disabled). */
  animations: AnimationTokens;
  /** Tech-stack fingerprint of the entry page, or null when disabled. */
  stack: StackProfile | null;
}

const EMPTY_ANIMATIONS: AnimationTokens = {
  durations: [],
  easings: [],
  keyframes: [],
  properties: { composited: [], paint: [], layout: [] },
  reducedMotion: { declared: false, gap: false },
};

/**
 * Full single-pass inspection of a live URL: discover pages (link crawl or
 * sitemap), reduce computed styles to DTCG tokens, and collect the
 * redesign-migration extras (asset manifest, CSS animation tokens, tech-stack
 * profile) from the entry page. One browser session.
 */
export async function inspectSite(
  target: string,
  options: InspectOptions = {},
): Promise<SiteReport> {
  const {
    breakpoints = [1280, 375],
    top = 1,
    sitemap = false,
    assets = true,
    animations = true,
    stack = true,
    deltaE,
    rootPx,
  } = options;

  const browser = await chromium.launch();
  try {
    let urls: string[];
    if (sitemap) {
      const found = await discoverSitemapUrls(target, { limit: top });
      urls = found.length > 0 ? found : [target];
    } else {
      urls = await discoverPages(browser, target, top);
    }

    const page = await browser.newPage();
    try {
      const pages: PageExtract[] = [];
      for (const url of urls) {
        for (const breakpoint of breakpoints) {
          pages.push(await extractPage(page, url, breakpoint));
        }
      }

      // Collect the extras once, from the entry page at its widest breakpoint.
      await page.setViewportSize({
        width: Math.max(...breakpoints),
        height: 900,
      });
      await page.goto(target, { waitUntil: "load" });

      const assetManifest = assets
        ? await discoverAssets(page, target)
        : { assets: [] };
      const animationTokens = animations
        ? await extractAnimations(page)
        : EMPTY_ANIMATIONS;
      const stackProfile = stack ? await profilePage(page) : null;

      const tokens = assembleTokens(pages, {
        deltaE,
        rootPx,
        animations: { durations: animationTokens.durations },
      });

      return {
        url: target,
        pages,
        tokens,
        assets: assetManifest,
        animations: animationTokens,
        stack: stackProfile,
      };
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

export { discoverPages } from "./crawl.js";
export { extractPage } from "./extract-page.js";
export { harvest, type RawObservations } from "./harvest.js";

// Asset harvesting (image/background/favicon/og-image/video-poster manifest).
export {
  buildAssetManifest,
  discoverAssets,
  type AssetKind,
  type AssetRef,
  type AssetManifest,
} from "./harvest-assets.js";

// Asset download (fetch a manifest to disk + manifest.json).
export {
  downloadAssets,
  assetFilename,
  type DownloadedAsset,
  type FailedAsset,
  type DownloadReport,
  type DownloadOptions,
} from "./download-assets.js";

// CSS animation tokens (durations, easings, @keyframes names) + animated-property
// performance classification (compositor / paint / layout smells) + reduced-motion
// accessibility coverage (WCAG 2.3.3).
export {
  reduceAnimationTokens,
  extractAnimations,
  classifyProperties,
  type RawAnimations,
  type AnimationTokens,
  type AnimatedProperties,
  type ReducedMotionCoverage,
} from "./animations.js";

// Runtime motion via the Web Animations API (catches JS-driven / WAAPI motion
// the static CSS read misses), classified with the same perf-smell taxonomy.
export {
  extractRuntimeMotion,
  type RuntimeAnimation,
  type RuntimeMotion,
} from "./runtime-motion.js";

// Minimal "rendering input for analysis" capture worker: full-page screenshots +
// runtime-motion snapshots per (URL, theme) written to a plain filesystem dir.
export {
  captureSite,
  type CaptureOptions,
  type ThemeCapture,
  type CaptureReport,
} from "./capture.js";

// Tech-stack fingerprinting (frameworks + generator + evidence).
export {
  profileStack,
  profilePage,
  type RawStackSignals,
  type Confidence,
  type FrameworkHit,
  type StackProfile,
} from "./profile-stack.js";

// Sitemap-driven page discovery.
export {
  parseSitemap,
  discoverSitemapUrls,
  type DiscoverSitemapOptions,
} from "./sitemap.js";

// Experimental (research tier): JS-animation-library detection. `Confidence` is
// re-used from profile-stack above, so it is not re-exported here.
export {
  detectMotion,
  detectPageMotion,
  MOTION_GLOBALS,
  type RawMotionSignals,
  type MotionLibrary,
  type LottieUsage,
  type AosUsage,
  type MotionReport,
} from "./detect-motion.js";

// Experimental (research tier): WAAPI capture of JS-driven motion.
export {
  reduceWaapiTimelines,
  captureMotion,
  type WaapiRecord,
  type MotionTimelines,
  type CaptureMotionOptions,
} from "./instrument-motion.js";

// --- gap-F: scroll library detection (extends detect-motion exports) ---
// No new exports needed — MotionReport and detectPageMotion already exported
// above, and MOTION_GLOBALS is re-exported with the detect-motion block.
// scrollLibraries and hasScrollSnap fields are part of MotionReport.
// --- end gap-F ---

// --- gap-I: layered asset detection (additive AssetRef fields, no new exports) ---
// AssetRef now includes position, zIndex, siblingImgCount, positionedAncestorSelector, isOverlay
// --- end gap-I ---

// --- gap-E: SVG icon extraction ---
export {
  extractSVGIcons,
  buildIconManifest,
  normaliseSvg,
  hashSvg,
  type RawSvgRef,
  type SvgIcon,
  type SvgIconManifest,
} from "./harvest-icons.js";
// --- end gap-E ---

// --- gap-A: per-element CSS harvest (keystone) ---
export {
  harvestStyles,
  type StyleNode,
  type StyleProps,
  type HarvestStylesOptions,
} from "./harvest-styles.js";
// --- end gap-A ---

// --- gap-G: text content extraction ---
export {
  extractContent,
  type TextNode,
  type PageContent,
  type ExtractContentOptions,
} from "./extract-content.js";
// --- end gap-G ---

// --- gap-D: page topology mapping ---
export {
  mapPageTopology,
  interpretTopology,
  type RawTopologySignals,
  type PageSection,
  type PageTopology,
  type PositionType,
} from "./map-topology.js";
// --- end gap-D ---
