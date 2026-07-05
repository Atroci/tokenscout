// Zero-new-runtime-dep test suite using node:test. Run via tsx (dev dep).
import { test } from "node:test";
import assert from "node:assert/strict";
import { relativeLuminance, contrastRatio, wcagVerdict } from "../src/color/contrast.js";
import { assembleTokens } from "../src/tokens/index.js";
import type { PageExtract } from "../src/schema.js";

const close = (a: number, b: number, eps = 0.01) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} not within ${eps} of ${b}`);

test("relativeLuminance: white is 1, black is 0", () => {
  close(relativeLuminance([1, 1, 1]), 1);
  close(relativeLuminance([0, 0, 0]), 0);
});

test("contrastRatio: black on white is the WCAG max, 21:1", () => {
  close(contrastRatio([0, 0, 0], [1, 1, 1]), 21, 0.1);
});

test("contrastRatio: identical colors ratio is 1, order-independent", () => {
  assert.equal(contrastRatio([0.4, 0.4, 0.4], [0.4, 0.4, 0.4]), 1);
  const a = contrastRatio([0, 0, 0], [0.9, 0.9, 0.9]);
  const b = contrastRatio([0.9, 0.9, 0.9], [0, 0, 0]);
  assert.equal(a, b);
});

test("wcagVerdict: thresholds at 4.5:1 (normal) and 3:1 (large)", () => {
  assert.deepEqual(wcagVerdict(4.5), { normalText: "pass", largeText: "pass" });
  assert.deepEqual(wcagVerdict(4.49), { normalText: "fail", largeText: "pass" });
  assert.deepEqual(wcagVerdict(2.99), { normalText: "fail", largeText: "fail" });
});

// End-to-end: assembleTokens should surface contrast pairs on the color
// group's $extensions, cross-joining the dominant background and text colors.
const pages: PageExtract[] = [
  {
    url: "https://example.com/",
    breakpoint: 1280,
    colors: [
      { value: "#ffffff", role: "background-color", count: 50 },
      { value: "#111111", role: "color", count: 40 },
      { value: "#767676", role: "color", count: 10 },
    ],
    type: { sizes: [] },
    spacing: { values: [] },
  },
];

test("assembleTokens: color group $extensions carries contrast-pairs", () => {
  const tokens = assembleTokens(pages);
  const color = tokens.color as { $extensions: Record<string, unknown> };
  const pairs = color.$extensions["com.tokenscout.contrast-pairs"] as Array<{
    background: string;
    text: string;
    ratio: number;
    wcag: { normalText: string; largeText: string };
  }>;

  assert.equal(pairs.length, 2); // 1 background x 2 text candidates
  const white_black = pairs.find((p) => p.text === "#111111")!;
  assert.ok(white_black);
  assert.equal(white_black.background, "#ffffff");
  assert.equal(white_black.wcag.normalText, "pass");

  const white_gray = pairs.find((p) => p.text === "#767676")!;
  assert.ok(white_gray);
  // #767676 on white is the canonical WCAG "just barely passes normal text" gray.
  close(white_gray.ratio, 4.54, 0.05);
  assert.equal(white_gray.wcag.normalText, "pass");
});
