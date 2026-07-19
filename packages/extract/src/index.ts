// @tokenscout/extract: drive a headless browser to produce the PageExtract[]
// that tokenscout's core reducers consume. Playwright is a peer dependency, so
// the consumer owns its version and installs the browser binaries.

import { chromium, type Page } from "playwright";
import { assembleTokens, type AssembleOptions } from "tokenscout/tokens";
import type { DesignTokens, PageExtract } from "tokenscout/schema";
import { discoverPages } from "./crawl.js";
import { extractPage } from "./extract-page.js";
import { discoverAssets, type AssetManifest } from "./harvest-assets.js";
import { extractAnimations, type AnimationTokens } from "./animations.js";
import { profilePage, type StackProfile } from "./profile-stack.js";
import { discoverSitemapUrls } from "./sitemap.js";
import { extractSVGIcons, type SvgIconManifest } from "./harvest-icons.js";
import { mapPageTopology, type PageTopology } from "./map-topology.js";
import {
  detectInteractionModel,
  type InteractionModel,
} from "./detect-interactions.js";
import {
  emitProgress,
  withProgressPhase,
  type ProgressListener,
} from "./progress.js";

export interface ExtractOptions {
  /** Viewport widths to extract at. Defaults to [1280, 375]. */
  breakpoints?: number[];
  /** Max same-origin pages to crawl from the entry URL. Defaults to 1. */
  top?: number;
  /** Optional structured lifecycle observer. Listener errors never abort extraction. */
  onProgress?: ProgressListener;
}

async function extractPages(
  page: Page,
  urls: string[],
  breakpoints: number[],
  onProgress: ProgressListener | undefined,
): Promise<PageExtract[]> {
  const total = urls.length * breakpoints.length;
  const extracts: PageExtract[] = [];
  let current = 0;

  for (const url of urls) {
    for (const breakpoint of breakpoints) {
      current += 1;
      const extracted = await withProgressPhase(
        onProgress,
        { phase: "viewport", url, breakpoint, current, total },
        () => extractPage(page, url, breakpoint),
        (result) => ({
          colors: result.colors.length,
          typeSizes: result.type.sizes.length,
          spacingValues: result.spacing.values.length,
        }),
      );
      extracts.push(extracted);
    }
  }

  return extracts;
}

async function extractSiteInternal(
  target: string,
  options: ExtractOptions,
): Promise<PageExtract[]> {
  const { breakpoints = [1280, 375], top = 1, onProgress } = options;
  const browser = await withProgressPhase(
    onProgress,
    { phase: "browser", url: target },
    () => chromium.launch(),
  );

  try {
    const urls = await withProgressPhase(
      onProgress,
      {
        phase: "discovery",
        url: target,
        detail: { method: top <= 1 ? "target" : "links" },
      },
      () => discoverPages(browser, target, top),
      (result) => ({ pages: result.length }),
    );
    const page = await browser.newPage();
    try {
      return await extractPages(page, urls, breakpoints, onProgress);
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
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
  return withProgressPhase(
    options.onProgress,
    { phase: "run", url: target, detail: { operation: "extract-site" } },
    () => extractSiteInternal(target, options),
  );
}

/** Convenience: extract a live URL straight to a DTCG token document. */
export async function extractTokens(
  target: string,
  options: ExtractOptions & AssembleOptions = {},
): Promise<DesignTokens> {
  const { breakpoints, top, onProgress, ...assembleOpts } = options;
  return withProgressPhase(
    onProgress,
    { phase: "run", url: target, detail: { operation: "extract-tokens" } },
    async () => {
      const pages = await extractSiteInternal(target, {
        breakpoints,
        top,
        onProgress,
      });
      return withProgressPhase(
        onProgress,
        { phase: "tokens", url: target },
        () => assembleTokens(pages, assembleOpts),
        (tokens) => ({
          groups: Object.keys(tokens).filter((key) => !key.startsWith("$"))
            .length,
        }),
      );
    },
  );
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
  /** Collect SVG icon manifest from the entry page. Defaults to true. */
  icons?: boolean;
  /** Map the page section topology from the entry page. Defaults to true. */
  topology?: boolean;
  /** Detect the page-level interaction driver (scroll/click/hover/time). Defaults to true. */
  interaction?: boolean;
  /** ΔE2000 clustering threshold passed to assembleTokens. */
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
  /** SVG icon manifest from the entry page (empty when icons option is false). */
  icons: SvgIconManifest;
  /** Page section topology from the entry page (null when topology option is false). */
  topology: PageTopology | null;
  /** Page-level interaction driver for the entry page (null when interaction option is false). */
  interaction: InteractionModel | null;
}

const EMPTY_ANIMATIONS: AnimationTokens = {
  durations: [],
  easings: [],
  keyframes: [],
  properties: { composited: [], paint: [], layout: [] },
  reducedMotion: { declared: false, gap: false },
};

const EMPTY_ICON_MANIFEST: SvgIconManifest = { icons: [] };

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
    icons = true,
    topology = true,
    interaction = true,
    deltaE,
    rootPx,
    onProgress,
  } = options;

  return withProgressPhase(
    onProgress,
    { phase: "run", url: target, detail: { operation: "inspect-site" } },
    async () => {
      const browser = await withProgressPhase(
        onProgress,
        { phase: "browser", url: target },
        () => chromium.launch(),
      );

      try {
        let discoveryFallback = false;
        const urls = await withProgressPhase(
          onProgress,
          {
            phase: "discovery",
            url: target,
            detail: {
              method: sitemap ? "sitemap" : top <= 1 ? "target" : "links",
            },
          },
          async () => {
            if (!sitemap) return discoverPages(browser, target, top);
            const found = await discoverSitemapUrls(target, { limit: top });
            if (found.length > 0) return found;
            discoveryFallback = true;
            return [target];
          },
          (result) => ({ pages: result.length, fallback: discoveryFallback }),
        );

        const page = await browser.newPage();
        try {
          const pages = await extractPages(page, urls, breakpoints, onProgress);

          // Collect the extras once, from the entry page at its widest breakpoint.
          await page.setViewportSize({
            width: Math.max(...breakpoints),
            height: 900,
          });
          await page.goto(target, { waitUntil: "load" });

          let assetManifest: AssetManifest;
          if (assets) {
            assetManifest = await withProgressPhase(
              onProgress,
              { phase: "assets", url: target },
              () => discoverAssets(page, target),
              (result) => ({ assets: result.assets.length }),
            );
          } else {
            assetManifest = { assets: [] };
            emitProgress(onProgress, {
              phase: "assets",
              status: "skipped",
              url: target,
            });
          }

          let animationTokens: AnimationTokens;
          if (animations) {
            animationTokens = await withProgressPhase(
              onProgress,
              { phase: "animations", url: target },
              () => extractAnimations(page),
              (result) => ({
                durations: result.durations.length,
                easings: result.easings.length,
                keyframes: result.keyframes.length,
                reducedMotionGap: result.reducedMotion.gap,
              }),
            );
          } else {
            animationTokens = EMPTY_ANIMATIONS;
            emitProgress(onProgress, {
              phase: "animations",
              status: "skipped",
              url: target,
            });
          }

          let stackProfile: StackProfile | null;
          if (stack) {
            stackProfile = await withProgressPhase(
              onProgress,
              { phase: "stack", url: target },
              () => profilePage(page),
              (result) => ({ frameworks: result.frameworks.length }),
            );
          } else {
            stackProfile = null;
            emitProgress(onProgress, {
              phase: "stack",
              status: "skipped",
              url: target,
            });
          }

          let iconManifest: SvgIconManifest;
          if (icons) {
            iconManifest = await withProgressPhase(
              onProgress,
              { phase: "icons", url: target },
              () => extractSVGIcons(page),
              (result) => ({ icons: result.icons.length }),
            );
          } else {
            iconManifest = EMPTY_ICON_MANIFEST;
            emitProgress(onProgress, {
              phase: "icons",
              status: "skipped",
              url: target,
            });
          }

          let topologyResult: PageTopology | null;
          if (topology) {
            topologyResult = await withProgressPhase(
              onProgress,
              { phase: "topology", url: target },
              () => mapPageTopology(page),
              (result) => ({
                sections: result.count,
                scrollSnap: result.hasScrollSnap,
              }),
            );
          } else {
            topologyResult = null;
            emitProgress(onProgress, {
              phase: "topology",
              status: "skipped",
              url: target,
            });
          }

          let interactionResult: InteractionModel | null;
          if (interaction) {
            interactionResult = await withProgressPhase(
              onProgress,
              { phase: "interaction", url: target },
              () => detectInteractionModel(page, "body"),
              (result) => ({
                interactionType: result.type,
                confidence: result.confidence,
              }),
            );
          } else {
            interactionResult = null;
            emitProgress(onProgress, {
              phase: "interaction",
              status: "skipped",
              url: target,
            });
          }

          const tokens = await withProgressPhase(
            onProgress,
            { phase: "tokens", url: target },
            () =>
              assembleTokens(pages, {
                deltaE,
                rootPx,
                animations: { durations: animationTokens.durations },
              }),
            (result) => ({
              groups: Object.keys(result).filter((key) => !key.startsWith("$"))
                .length,
            }),
          );

          return {
            url: target,
            pages,
            tokens,
            assets: assetManifest,
            animations: animationTokens,
            stack: stackProfile,
            icons: iconManifest,
            topology: topologyResult,
            interaction: interactionResult,
          };
        } finally {
          await page.close();
        }
      } finally {
        await browser.close();
      }
    },
  );
}

export { discoverPages } from "./crawl.js";
export { extractPage } from "./extract-page.js";
export { harvest, type RawObservations } from "./harvest.js";
export type {
  ProgressPhase,
  ProgressStatus,
  ProgressDetail,
  ProgressEvent,
  ProgressListener,
} from "./progress.js";

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

// --- gap-B: multi-state CSS diff ---
// Note: CaptureOptions is intentionally omitted here — it conflicts with the
// CaptureOptions already exported from capture.ts above. Consumers needing
// capture-states CaptureOptions import directly from "./capture-states.js".
export {
  diffStates,
  snapshotElementStyles,
  captureScrollState,
  captureClickState,
  type ElementState,
  type ElementStyles,
  type CssDiff,
  type StateDiff,
} from "./capture-states.js";
// --- end gap-B ---

// --- gap-C: interaction model detection ---
export {
  detectInteraction,
  detectInteractionModel,
  type RawInteractionSignals,
  type InteractionType,
  type InteractionModel,
} from "./detect-interactions.js";
// --- end gap-C ---

// --- gap-H: responsive layout diff ---
export {
  diffBreakpoints,
  diffLayoutSnapshots,
  type LayoutSnapshot,
  type LayoutChange,
  type SelectorBreakpointDiff,
  type LayoutPropName,
  type DiffBreakpointsOptions,
} from "./diff-breakpoints.js";
// --- end gap-H ---

// Stable study artifact: measured evidence -> transferable design DNA.
export {
  DESIGN_DNA_VERSION,
  buildDesignDNA,
  renderDesignDNAMarkdown,
  studySite,
  type DesignDNA,
  type DesignDNAConfidence,
  type DesignDNAEvidence,
  type DesignDNAFinding,
  type DesignDNAGuidance,
  type BuildDesignDNAOptions,
  type StudySiteOptions,
  type StudySiteResult,
} from "./design-dna.js";
