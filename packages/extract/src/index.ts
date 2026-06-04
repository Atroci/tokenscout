// @tokenscout/extract: drive a headless browser to produce the PageExtract[]
// that tokenscout's core reducers consume. Playwright is a peer dependency, so
// the consumer owns its version and installs the browser binaries.

import { chromium } from "playwright";
import { assembleTokens, type AssembleOptions } from "tokenscout/tokens";
import type { DesignTokens, PageExtract } from "tokenscout/schema";
import { discoverPages } from "./crawl.js";
import { extractPage } from "./extract-page.js";

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

// CSS animation tokens (durations, easings, @keyframes names).
export {
  reduceAnimationTokens,
  extractAnimations,
  type RawAnimations,
  type AnimationTokens,
} from "./animations.js";

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
