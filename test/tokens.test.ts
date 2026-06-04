// DTCG token-assembly tests using node:test, run via tsx. Zero new runtime deps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleTokens } from "../src/tokens/index.js";
import type { PageExtract } from "../src/schema.js";

// One hand-made multi-breakpoint fixture exercising all three groups.
const pages: PageExtract[] = [
  {
    url: "https://example.com/",
    breakpoint: 1280,
    colors: [
      { value: "#3a7bd5", role: "background-color", count: 40 },
      { value: "#3b7cd6", role: "color", count: 5 },
      { value: "rgb(58, 123, 213)", role: "border-color", count: 2 },
      { value: "#e23744", role: "color", count: 12 },
    ],
    type: { sizes: ["16px", "24px", "1.5rem"] },
    spacing: { values: ["8px", "16px", "1.5rem"] },
  },
  {
    url: "https://example.com/",
    breakpoint: 375,
    colors: [{ value: "#e23744", role: "background-color", count: 3 }],
    type: { sizes: ["14px", "16px"] },
    spacing: { values: ["8px", "0.5rem"] },
  },
];

test("assembleTokens: emits a DTCG group per domain", () => {
  const tokens = assembleTokens(pages);
  assert.deepEqual(Object.keys(tokens), ["color", "fontSize", "spacing"]);
});

test("assembleTokens: colors clustered, keyed by totalCount desc", () => {
  const tokens = assembleTokens(pages);
  const color = tokens.color as Record<
    string,
    { $value: string; $type: string }
  >;
  // Blue trio merges into one cluster; red into another -> two color tokens.
  assert.deepEqual(Object.keys(color), ["color-1", "color-2"]);
  // Highest total (blue 40+5+2=47) ranks first; its canonical is the top member.
  assert.equal(color["color-1"].$value, "#3a7bd5");
  assert.equal(color["color-1"].$type, "color");
  assert.equal(color["color-2"].$value, "#e23744");
});

test("assembleTokens: font sizes ascending dimension tokens (rem via rootPx)", () => {
  const tokens = assembleTokens(pages);
  const fs = tokens.fontSize as Record<
    string,
    { $value: { value: number; unit: string }; $type: string }
  >;
  // 14, 16, 24 (1.5rem * 16 == 24 dedupes with the literal 24px).
  assert.deepEqual(Object.keys(fs), [
    "font-size-1",
    "font-size-2",
    "font-size-3",
  ]);
  assert.deepEqual(fs["font-size-1"].$value, { value: 14, unit: "px" });
  assert.deepEqual(fs["font-size-2"].$value, { value: 16, unit: "px" });
  assert.deepEqual(fs["font-size-3"].$value, { value: 24, unit: "px" });
  assert.equal(fs["font-size-1"].$type, "dimension");
});

test("assembleTokens: spacing dimension tokens on detected grid", () => {
  const tokens = assembleTokens(pages);
  const sp = tokens.spacing as Record<
    string,
    { $value: { value: number; unit: string }; $type: string }
  >;
  // values resolve to 8, 16, 24, 8, 8 -> grid base 8 -> {8, 16, 24}.
  assert.deepEqual(Object.keys(sp), ["spacing-1", "spacing-2", "spacing-3"]);
  assert.deepEqual(sp["spacing-1"].$value, { value: 8, unit: "px" });
  assert.deepEqual(sp["spacing-2"].$value, { value: 16, unit: "px" });
  assert.deepEqual(sp["spacing-3"].$value, { value: 24, unit: "px" });
});

test("assembleTokens: honors a custom rootPx for rem conversion", () => {
  const remPages: PageExtract[] = [
    {
      url: "https://example.com/",
      breakpoint: 1280,
      colors: [],
      type: { sizes: ["1rem", "2rem"] },
      spacing: { values: [] },
    },
  ];
  const tokens = assembleTokens(remPages, { rootPx: 10 });
  const fs = tokens.fontSize as Record<
    string,
    { $value: { value: number; unit: string } }
  >;
  assert.deepEqual(fs["font-size-1"].$value, { value: 10, unit: "px" });
  assert.deepEqual(fs["font-size-2"].$value, { value: 20, unit: "px" });
});

test("assembleTokens: omits empty groups", () => {
  const colorOnly: PageExtract[] = [
    {
      url: "https://example.com/",
      breakpoint: 1280,
      colors: [{ value: "#000000", role: "color", count: 1 }],
      type: { sizes: [] },
      spacing: { values: [] },
    },
  ];
  const tokens = assembleTokens(colorOnly);
  assert.deepEqual(Object.keys(tokens), ["color"]);
});

test("assembleTokens: empty input yields an empty document", () => {
  assert.deepEqual(assembleTokens([]), {});
});

test("assembleTokens: drops unparseable colors (hsl/oklch not yet supported)", () => {
  const messy: PageExtract[] = [
    {
      url: "https://example.com/",
      breakpoint: 1280,
      colors: [
        { value: "hsl(210, 50%, 50%)", role: "color", count: 9 },
        { value: "#e23744", role: "color", count: 4 },
      ],
      type: { sizes: [] },
      spacing: { values: [] },
    },
  ];
  const tokens = assembleTokens(messy);
  const color = tokens.color as Record<string, { $value: string }>;
  assert.deepEqual(Object.keys(color), ["color-1"]);
  assert.equal(color["color-1"].$value, "#e23744");
});
