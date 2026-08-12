// Direct smoke coverage for the Page-taking collector wrappers that
// inspectSite()/studySite() call internally but that had no dedicated test of
// their own (only exercised indirectly, and only for their happy path, through
// the composed pipeline in extract.smoke.test.ts / inspect.smoke.test.ts).
//
// One shared browser + page across every test() in this file, unlike the
// per-capability smoke files (extract.smoke, inspect.smoke, capture.smoke,
// motion.smoke), which each call a full public pipeline function and manage
// their own browser lifecycle internally. These tests call the lower-level
// wrappers directly, so *this* file owns the browser — sharing one launch
// across ~15 small tests instead of paying Chromium startup once per test.
//
// Imports the built output, not src, for the same reason as every other
// *.smoke.test.ts here: Playwright serializes each page-side collector with
// Function.toString(), and running src through tsx/esbuild injects a `__name`
// helper that is undefined in the browser context. Requires `npm run build`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import {
  extractPage,
  discoverPages,
  extractAnimations,
  extractContent,
  harvestStyles,
  mapPageTopology,
  profilePage,
  extractSVGIcons,
  discoverAssets,
  diffBreakpoints,
  snapshotElementStyles,
  captureScrollState,
  captureClickState,
  detectInteractionModel,
  diffStates,
} from "../dist/index.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string) => pathToFileURL(join(fixturesDir, name)).href;

const sample = fixture("sample.html");
const collectors = fixture("collectors.html");
const crawlA = fixture("crawl-a.html");

let browser: Browser;
let page: Page;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});

after(async () => {
  await browser.close();
});

test("extractPage: loads a URL at a breakpoint and reduces it to a PageExtract", async () => {
  const extracted = await extractPage(page, sample, 1280);
  assert.equal(extracted.url, sample);
  assert.equal(extracted.breakpoint, 1280);
  assert.ok(extracted.colors.length > 0, "should observe at least one color");
  assert.ok(extracted.type.sizes.length > 0, "should observe font sizes");
});

test("discoverPages: top<=1 returns just the entry, no navigation", async () => {
  assert.deepEqual(await discoverPages(browser, crawlA, 1), [crawlA]);
});

test("discoverPages: top>1 crawls same-origin links, dedupes, and drops cross-origin", async () => {
  const crawlB = fixture("crawl-b.html");
  const crawlC = fixture("crawl-c.html");
  const found = await discoverPages(browser, crawlA, 5);
  assert.deepEqual(found, [crawlA, crawlB, crawlC]);
  assert.ok(
    found.every((u) => !u.startsWith("https://example.com")),
    "the external, cross-origin link must not appear",
  );
});

test("discoverPages: top>1 caps at the requested count even when more pages are discoverable", async () => {
  // The fixture has 3 same-origin pages total (A, B, C); requesting 2 must
  // truncate, not just naturally return fewer because there was nothing else.
  const found = await discoverPages(browser, crawlA, 2);
  assert.equal(found.length, 2);
  assert.deepEqual(found, [crawlA, fixture("crawl-b.html")]);
});

test("extractAnimations: reads transitions and @keyframes from a loaded page", async () => {
  await page.goto(sample, { waitUntil: "load" });
  const tokens = await extractAnimations(page);
  assert.deepEqual(tokens.durations, [300, 500]);
  assert.ok(tokens.keyframes.includes("fade-in"));
});

test("extractContent: collects single-text-node copy, alt, aria-label, and placeholder", async () => {
  await page.goto(collectors, { waitUntil: "load" });
  const content = await extractContent(page);
  assert.ok(
    content.texts.some((t) => t.text === "Collectors fixture heading"),
    "should capture the h1 text",
  );
  assert.ok(content.alts.includes("a decorative icon"));
  assert.ok(content.ariaLabels.includes("intro paragraph"));
  assert.ok(content.placeholders.includes("Search the fixture"));
});

test("harvestStyles: walks the rendered DOM into a noise-filtered style tree", async () => {
  await page.goto(collectors, { waitUntil: "load" });
  const tree = await harvestStyles(page, { selector: "header.nav" });
  assert.ok(tree, "should find the header.nav root");
  assert.equal(tree!.tag, "header");
  assert.equal(tree!.styles.position, "sticky");
});

test("harvestStyles: returns null when the selector is not present", async () => {
  await page.goto(collectors, { waitUntil: "load" });
  assert.equal(
    await harvestStyles(page, { selector: "#does-not-exist" }),
    null,
  );
});

test("mapPageTopology: maps sections and reports scroll-snap absence", async () => {
  await page.goto(collectors, { waitUntil: "load" });
  const topology = await mapPageTopology(page);
  assert.ok(topology.count > 0, "should find at least one section");
  assert.equal(topology.hasScrollSnap, false);
});

test("profilePage: reads real page signals and detects the Next.js marker", async () => {
  await page.goto(collectors, { waitUntil: "load" });
  const profile = await profilePage(page);
  const react = profile.frameworks.find((f) => f.name === "React");
  assert.ok(react, "the __NEXT_DATA__ + #__next markers should imply React");
  assert.equal(react!.confidence, "high");
});

test("profilePage: a plain page with no framework markers yields no hits", async () => {
  await page.goto(sample, { waitUntil: "load" });
  const profile = await profilePage(page);
  assert.deepEqual(profile.frameworks, []);
});

test("extractSVGIcons: harvests and de-duplicates inline <svg> icons", async () => {
  await page.goto(collectors, { waitUntil: "load" });
  const manifest = await extractSVGIcons(page);
  assert.equal(manifest.icons.length, 1);
});

test("discoverAssets: a file:// page with only local image refs yields an empty, well-shaped manifest", async () => {
  await page.goto(collectors, { waitUntil: "load" });
  const manifest = await discoverAssets(page, collectors);
  assert.deepEqual(manifest, { assets: [] });
});

test("detectInteractionModel: position:sticky with no scroll-snap → scroll-driven, medium", async () => {
  await page.goto(collectors, { waitUntil: "load" });
  const model = await detectInteractionModel(page, "header.nav");
  assert.equal(model.type, "scroll-driven");
  assert.equal(model.confidence, "medium");
  assert.equal(model.mechanism, "position:sticky");
});

test("snapshotElementStyles: reads the current computed styles for a selector", async () => {
  await page.goto(collectors, { waitUntil: "load" });
  const state = await snapshotElementStyles(page, "header.nav");
  assert.equal(state.selector, "header.nav");
  assert.equal(state.styles.position, "sticky");
});

test("snapshotElementStyles: an absent selector yields an empty style map", async () => {
  await page.goto(collectors, { waitUntil: "load" });
  const state = await snapshotElementStyles(page, "#does-not-exist");
  assert.deepEqual(state, { selector: "#does-not-exist", styles: {} });
});

test("captureClickState: clicking the disclosure trigger changes the observed panel's styles", async () => {
  await page.goto(collectors, { waitUntil: "load" });
  const before = await captureClickState(
    page,
    "#disclosure .panel",
    "#disclosure summary",
    { waitMs: 50 },
  );
  // Undo the click so this test doesn't leak state into later ones sharing `page`.
  await page.click("#disclosure summary");
  assert.notEqual(before.styles.opacity, undefined);
});

test("captureScrollState: scrolling past the threshold changes the observed element's styles", async () => {
  await page.goto(collectors, { waitUntil: "load" });
  const atTop = await captureScrollState(page, "#scroll-target", 0, {
    waitMs: 50,
  });
  const scrolled = await captureScrollState(page, "#scroll-target", 600, {
    waitMs: 50,
  });
  const diff = diffStates(atTop, scrolled);
  assert.ok(
    diff.diffs.some((d) => d.property === "opacity"),
    "opacity should differ between the top and scrolled snapshots",
  );
});

test("diffBreakpoints: re-navigates per breakpoint and reports a layout change", async () => {
  const changes = await diffBreakpoints(page, sample, [".grid"], {
    breakpoints: [1280, 375],
  });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].selector, ".grid");
  assert.equal(changes[0].snapshots.length, 2);
  assert.deepEqual(
    changes[0].snapshots.map((s) => s.breakpoint),
    [1280, 375],
  );
});
