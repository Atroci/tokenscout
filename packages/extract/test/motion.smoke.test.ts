// Experimental research-tier motion smoke tests against real Chromium. Imports
// the built output (Playwright serializes page-side collectors; tsx/esbuild
// would inject a `__name` helper undefined in the browser). Requires a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { detectPageMotion, captureMotion } from "../dist/index.js";

const fixtureUrl = (name: string) =>
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "fixtures", name))
    .href;

test("detectPageMotion: fingerprints libraries, AOS configs, and Lottie", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(fixtureUrl("motion-libs.html"), { waitUntil: "load" });
    const report = await detectPageMotion(page);

    const names = report.libraries.map((l) => l.name);
    assert.ok(names.includes("GSAP"));
    assert.ok(names.includes("AOS"));
    assert.ok(names.includes("Lottie"));
    assert.ok(names.includes("Framer Motion"));
    assert.deepEqual(report.aos.effects, ["fade-up", "zoom-in"]);
    assert.equal(report.lottie.present, true);
    assert.ok(report.lottie.sources.includes("/anim/hero.json"));
  } finally {
    await browser.close();
  }
});

test("captureMotion: records Element.animate calls into motion tokens", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const timelines = await captureMotion(page, fixtureUrl("waapi.html"), {
      scroll: false,
      settleMs: 300,
    });
    assert.ok(timelines.count >= 2, "captured at least the two animate calls");
    assert.deepEqual(timelines.durations, [250, 400]);
    assert.ok(timelines.easings.includes("ease-out"));
    assert.ok(timelines.properties.includes("opacity"));
    assert.ok(timelines.properties.includes("transform"));
  } finally {
    await browser.close();
  }
});
