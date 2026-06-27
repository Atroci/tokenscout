// Minimal "rendering input for analysis" capture worker.
//
// Per the verified Area-2 architecture (lane-minimal): drive Playwright directly
// in-process, one browser context per (URL, theme), capture a full-page
// screenshot + a Web Animations runtime-motion snapshot, and write everything to
// a plain filesystem directory. Deliberately NO Browserless (SSPL/commercial),
// NO object storage (MinIO is archived), NO queue: those are deferred behind
// concrete triggers (capture volume, multi-host, long-term retention).
//
// Usage (the in-process worker loop):
//   import { captureSite } from "@tokenscout/extract";
//   await captureSite(["https://example.com"], { outDir: "./captures" });
// Deploy on a Docker host with a Playwright base image; pass launchArgs:
// ["--no-sandbox"] only if your container runs as root.

import { chromium, type Browser, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractRuntimeMotion, type RuntimeMotion } from "./runtime-motion.js";

export interface CaptureOptions {
  /** Directory to write screenshots + capture.json into. Created if missing. */
  outDir: string;
  /** Viewport width for capture. Defaults to 1280. */
  width?: number;
  /** Also capture a prefers-color-scheme: dark pass. Defaults to true. */
  dark?: boolean;
  /** Scroll through the page to trigger reveal-on-scroll / lazy content before the screenshot. Defaults to true. */
  scroll?: boolean;
  /** Ms to wait after scrolling for entrance transitions to finish. Defaults to 800. */
  settleMs?: number;
  /**
   * Extra Chromium launch args. `--disable-dev-shm-usage` is always set (Docker
   * /dev/shm exhaustion). Add `--no-sandbox` here only for root containers.
   */
  launchArgs?: string[];
}

/** One captured theme state for a URL. */
export interface ThemeCapture {
  /** "light" or "dark" (the emulated prefers-color-scheme). */
  theme: "light" | "dark";
  /** Screenshot filename, relative to outDir. */
  screenshot: string;
  /** Runtime motion snapshot for this theme state. */
  motion: RuntimeMotion;
}

/** Everything one captured URL yields. */
export interface CaptureReport {
  url: string;
  captures: ThemeCapture[];
}

// /dev/shm is small in default Docker; without this Chromium can crash mid-run.
const BASE_ARGS = ["--disable-dev-shm-usage"];

function slug(url: string): string {
  const s = url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || "page";
}

/**
 * Trigger reveal-on-scroll and lazy content by stepping through the whole page,
 * then return to the top and let entrance transitions finish. Without this, a
 * full-page screenshot of an IntersectionObserver-driven page is mostly blank.
 */
async function scrollAndSettle(page: Page, settleMs: number): Promise<void> {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    let last = -1;
    for (let i = 0; i < 80; i++) {
      window.scrollBy(0, step);
      await sleep(100);
      if (window.scrollY === last) break; // reached the bottom
      last = window.scrollY;
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(settleMs);
}

async function captureOne(
  browser: Browser,
  url: string,
  opts: CaptureOptions,
): Promise<CaptureReport> {
  const width = opts.width ?? 1280;
  const settleMs = opts.settleMs ?? 800;
  const scroll = opts.scroll !== false;
  const themes: ("light" | "dark")[] =
    opts.dark === false ? ["light"] : ["light", "dark"];

  const captures: ThemeCapture[] = [];
  for (const theme of themes) {
    // One fresh context per capture, closed immediately after: bounds memory on
    // the shared, RAM-tight host instead of accumulating state in one context.
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: theme,
    });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "load" });
      // Snapshot motion while entrance animations are still running at load.
      const motion = await extractRuntimeMotion(page);
      // Reveal-on-scroll / lazy content stays opacity:0 until scrolled into view,
      // so a naive full-page shot is blank: scroll through and settle first.
      if (scroll) await scrollAndSettle(page, settleMs);
      const screenshot = `${slug(url)}-${theme}.png`;
      await page.screenshot({
        path: join(opts.outDir, screenshot),
        fullPage: true,
      });
      captures.push({ theme, screenshot, motion });
    } finally {
      await context.close();
    }
  }
  return { url, captures };
}

/**
 * Capture one or more URLs to `outDir`: a full-page screenshot per theme state
 * plus a runtime-motion snapshot, with a `capture.json` manifest. Sequential
 * in-process loop (one browser per run, recycled context per capture): the
 * lane-minimal default; raise concurrency or add a queue only when volume needs
 * it. Captures are meant to be consumed by an analysis run and then discarded.
 */
export async function captureSite(
  targets: string | string[],
  opts: CaptureOptions,
): Promise<CaptureReport[]> {
  const urls = Array.isArray(targets) ? targets : [targets];
  await mkdir(opts.outDir, { recursive: true });

  const browser = await chromium.launch({
    args: [...BASE_ARGS, ...(opts.launchArgs ?? [])],
  });
  try {
    const reports: CaptureReport[] = [];
    for (const url of urls) {
      reports.push(await captureOne(browser, url, opts));
    }
    await writeFile(
      join(opts.outDir, "capture.json"),
      JSON.stringify(reports, null, 2),
    );
    return reports;
  } finally {
    await browser.close();
  }
}
