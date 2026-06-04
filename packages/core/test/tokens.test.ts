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

interface ColorToken {
  $value: { colorSpace: string; components: number[]; alpha: number };
  $type: string;
  $extensions: Record<string, unknown>;
}

// Per DTCG, `$`-prefixed members (e.g. group-level `$extensions`) are reserved
// metadata, not tokens. Counting tokens skips them.
const tokenEntries = <T>(g: Record<string, T>): [string, T][] =>
  Object.entries(g).filter(([k]) => !k.startsWith("$"));
const tokenKeys = (g: Record<string, unknown>): string[] =>
  Object.keys(g).filter((k) => !k.startsWith("$"));
const tokenValues = <T>(g: Record<string, T>): T[] =>
  tokenEntries(g).map(([, v]) => v);

test("assembleTokens: colors clustered, ordered by usage-count desc", () => {
  const tokens = assembleTokens(pages);
  const color = tokens.color as Record<string, ColorToken>;
  // Blue trio merges into one cluster; red into another -> two color tokens.
  // Keys are content-hashed, not positional, so assert on count + order.
  const entries = tokenEntries(color);
  assert.equal(entries.length, 2);

  // Insertion order is cluster order (totalCount desc): blue first, red second.
  const [, blue] = entries[0];
  const [, red] = entries[1];

  // Blue ranks first (40+5+2=47 > red 12+3=15).
  assert.equal(blue.$extensions["com.tokenscout.usage-count"], 47);
  assert.equal(red.$extensions["com.tokenscout.usage-count"], 15);

  // $value is a DTCG structured color, not a raw string.
  assert.equal(blue.$value.colorSpace, "srgb");
  assert.equal(blue.$value.alpha, 1);
  assert.equal(blue.$type, "color");
  assert.equal(blue.$value.components.length, 3);

  // Components round-trip to the canonical "#3a7bd5".
  const [r, g, b] = blue.$value.components;
  assert.ok(Math.abs(r - 0x3a / 255) < 1e-4, `r ${r}`);
  assert.ok(Math.abs(g - 0x7b / 255) < 1e-4, `g ${g}`);
  assert.ok(Math.abs(b - 0xd5 / 255) < 1e-4, `b ${b}`);
  assert.equal(Math.round(r * 255), 0x3a);
  assert.equal(Math.round(g * 255), 0x7b);
  assert.equal(Math.round(b * 255), 0xd5);
});

test("assembleTokens: color token carries DTCG $extensions metadata", () => {
  const tokens = assembleTokens(pages);
  const color = tokens.color as Record<string, ColorToken>;
  const [key, blue] = tokenEntries(color)[0];

  // Stable id: nearest-name + "-" + 7-char hash.
  assert.match(key, /^[a-z]+-[0-9a-z]{7}$/);

  const ext = blue.$extensions;
  assert.equal(ext["com.tokenscout.css-authored-as"], "#3a7bd5");
  // usage-count is the summed cluster count (blue 40+5+2 = 47).
  assert.equal(ext["com.tokenscout.usage-count"], 47);
  // css-properties is a sorted array of the member roles.
  assert.deepEqual(ext["com.tokenscout.css-properties"], [
    "background-color",
    "border-color",
    "color",
  ]);
  assert.equal(ext["com.tokenscout.member-count"], 3);
  assert.deepEqual(ext["com.tokenscout.members"], [
    "#3a7bd5",
    "#3b7cd6",
    "rgb(58, 123, 213)",
  ]);
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

test("assembleTokens: a fully transparent paint never becomes a color token", () => {
  // alpha 0 is not a brand color. Even outweighing the opaque value by count,
  // it must not win as canonical: clustering ignores alpha, so it would
  // otherwise collapse onto the same RGB and take the slot.
  const withTransparent: PageExtract[] = [
    {
      url: "https://example.com/",
      breakpoint: 1280,
      colors: [
        { value: "rgba(0, 0, 0, 0)", role: "background-color", count: 99 },
        { value: "#e23744", role: "color", count: 4 },
      ],
      type: { sizes: [] },
      spacing: { values: [] },
    },
  ];
  const tokens = assembleTokens(withTransparent);
  const color = tokens.color as Record<string, ColorToken>;
  // Only the opaque red survives; the transparent paint produces no token.
  assert.equal(tokenKeys(color).length, 1);
  const [, only] = tokenEntries(color)[0];
  assert.equal(only.$extensions["com.tokenscout.css-authored-as"], "#e23744");
});

test("assembleTokens: hsl() colors are now parsed into a token", () => {
  const withHsl: PageExtract[] = [
    {
      url: "https://example.com/",
      breakpoint: 1280,
      colors: [
        { value: "hsl(210, 50%, 50%)", role: "color", count: 9 },
        { value: "#e23744", role: "background-color", count: 4 },
      ],
      type: { sizes: [] },
      spacing: { values: [] },
    },
  ];
  const tokens = assembleTokens(withHsl);
  const color = tokens.color as Record<string, ColorToken>;
  // Both the hsl() blue and the hex red yield tokens (distinct hues).
  assert.equal(tokenKeys(color).length, 2);
  // The hsl() value is preserved verbatim in css-authored-as.
  const authored = tokenValues(color).map(
    (t) => t.$extensions["com.tokenscout.css-authored-as"],
  );
  assert.ok(authored.includes("hsl(210, 50%, 50%)"));
  // hsl(210,50%,50%) -> sRGB ~ (0.25, 0.5, 0.75).
  const blue = tokenValues(color).find(
    (t) =>
      t.$extensions["com.tokenscout.css-authored-as"] === "hsl(210, 50%, 50%)",
  )!;
  const [r, g, b] = blue.$value.components;
  assert.ok(Math.abs(r - 0.25) < 1e-3, `r ${r}`);
  assert.ok(Math.abs(g - 0.5) < 1e-3, `g ${g}`);
  assert.ok(Math.abs(b - 0.75) < 1e-3, `b ${b}`);
});

test("assembleTokens: still drops oklch()/lab() unsupported colors", () => {
  const messy: PageExtract[] = [
    {
      url: "https://example.com/",
      breakpoint: 1280,
      colors: [
        { value: "oklch(0.7 0.1 200)", role: "color", count: 9 },
        { value: "lab(50% 40 59.5)", role: "color", count: 7 },
        { value: "#e23744", role: "color", count: 4 },
      ],
      type: { sizes: [] },
      spacing: { values: [] },
    },
  ];
  const tokens = assembleTokens(messy);
  const color = tokens.color as Record<string, ColorToken>;
  // Only the hex red parses; oklch()/lab() fall through to null and are dropped.
  assert.equal(tokenKeys(color).length, 1);
  const [, only] = tokenEntries(color)[0];
  assert.equal(only.$extensions["com.tokenscout.css-authored-as"], "#e23744");
});

test("assembleTokens: color group carries sprawl audit metrics in $extensions", () => {
  const tokens = assembleTokens(pages);
  const ext = (tokens.color as Record<string, unknown>)[
    "$extensions"
  ] as Record<string, number>;
  // 4 distinct analyzable strings (#3a7bd5, #3b7cd6, rgb(58,123,213), #e23744;
  // the second page's #e23744 dedupes) collapse to 2 perceptual clusters.
  assert.equal(ext["com.tokenscout.analyzable"], 4);
  assert.equal(ext["com.tokenscout.unanalyzable"], 0);
  assert.equal(ext["com.tokenscout.distinct"], 2);
  assert.equal(ext["com.tokenscout.sprawl-ratio"], 2);
});

test("assembleTokens: sprawl metrics count unparseable colors as unanalyzable", () => {
  const messy: PageExtract[] = [
    {
      url: "https://example.com/",
      breakpoint: 1280,
      colors: [
        { value: "oklch(0.7 0.1 200)", role: "color", count: 9 },
        { value: "lab(50% 40 59.5)", role: "color", count: 7 },
        { value: "#e23744", role: "color", count: 4 },
      ],
      type: { sizes: [] },
      spacing: { values: [] },
    },
  ];
  const ext = (assembleTokens(messy).color as Record<string, unknown>)[
    "$extensions"
  ] as Record<string, number>;
  assert.equal(ext["com.tokenscout.analyzable"], 1);
  assert.equal(ext["com.tokenscout.unanalyzable"], 2);
  assert.equal(ext["com.tokenscout.distinct"], 1);
  assert.equal(ext["com.tokenscout.sprawl-ratio"], 1);
});

test("assembleTokens: emits a sorted, deduped DTCG duration group from animations", () => {
  const page: PageExtract[] = [
    {
      url: "https://example.com/",
      breakpoint: 1280,
      colors: [],
      type: { sizes: [] },
      spacing: { values: [] },
    },
  ];
  const tokens = assembleTokens(page, {
    animations: { durations: [300, 150, 300, 0, -5] },
  });
  const duration = tokens.duration as Record<
    string,
    { $value: { value: number; unit: string }; $type: string }
  >;
  // 0 and negative dropped, duplicates collapsed, ascending.
  assert.deepEqual(Object.keys(duration), ["duration-1", "duration-2"]);
  assert.deepEqual(duration["duration-1"].$value, { value: 150, unit: "ms" });
  assert.deepEqual(duration["duration-2"].$value, { value: 300, unit: "ms" });
  assert.equal(duration["duration-1"].$type, "duration");
});

test("assembleTokens: omits the duration group when no motion is supplied", () => {
  const page: PageExtract[] = [
    {
      url: "https://example.com/",
      breakpoint: 1280,
      colors: [{ value: "#000000", role: "color", count: 1 }],
      type: { sizes: [] },
      spacing: { values: [] },
    },
  ];
  assert.equal("duration" in assembleTokens(page), false);
  assert.equal("duration" in assembleTokens(page, { animations: {} }), false);
});
