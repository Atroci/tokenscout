// Zero-new-runtime-dep test suite using node:test. Run via tsx (dev dep).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rgbToLab,
  deltaE76,
  deltaE2000,
  parseColor,
  clusterColors,
  nearestNamedColor,
  stableColorId,
  hashString,
  DEFAULT_DELTA_E,
  NAMED_COLORS,
} from "../src/index.js";

const close = (a: number, b: number, eps = 0.5) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} not within ${eps} of ${b}`);

test("rgbToLab: reference whites and primaries", () => {
  const white = rgbToLab([1, 1, 1]);
  close(white[0], 100);
  close(white[1], 0);
  close(white[2], 0);

  const black = rgbToLab([0, 0, 0]);
  close(black[0], 0);

  // sRGB red ~ L*53.24, a*80.09, b*67.20 (well-known reference values).
  const red = rgbToLab([1, 0, 0]);
  close(red[0], 53.24, 1);
  close(red[1], 80.09, 1.5);
  close(red[2], 67.2, 1.5);
});

test("deltaE76: identity is zero, symmetric", () => {
  const a = rgbToLab([0.2, 0.4, 0.6]);
  const b = rgbToLab([0.2, 0.4, 0.61]);
  assert.equal(deltaE76(a, a), 0);
  close(deltaE76(a, b), deltaE76(b, a), 0);
  assert.ok(deltaE76(a, b) > 0);
});

test("parseColor: hex 6-digit", () => {
  const p = parseColor("#3a7bd5");
  assert.ok(p);
  close(p.rgb[0] * 255, 0x3a, 0.01);
  close(p.rgb[1] * 255, 0x7b, 0.01);
  close(p.rgb[2] * 255, 0xd5, 0.01);
  assert.equal(p.alpha, 1);
});

test("parseColor: hex 3-digit expands", () => {
  const p = parseColor("#abc");
  assert.ok(p);
  close(p.rgb[0] * 255, 0xaa, 0.01);
  close(p.rgb[1] * 255, 0xbb, 0.01);
  close(p.rgb[2] * 255, 0xcc, 0.01);
});

test("parseColor: hex 4-digit (#RGBA) and 8-digit (#RRGGBBAA) alpha", () => {
  const four = parseColor("#0f08");
  assert.ok(four);
  close(four.alpha, 0x88 / 255, 0.01);

  const eight = parseColor("#3a7bd580");
  assert.ok(eight);
  close(eight.alpha, 0x80 / 255, 0.01);
});

test("parseColor: rgb() and rgba()", () => {
  const rgb = parseColor("rgb(58, 123, 213)");
  assert.ok(rgb);
  close(rgb.rgb[0] * 255, 58, 0.01);
  assert.equal(rgb.alpha, 1);

  const rgba = parseColor("rgba(58,123,213,0.5)");
  assert.ok(rgba);
  close(rgba.alpha, 0.5, 0.001);
});

test("parseColor: clamps out-of-range rgb() channels to gamut", () => {
  const p = parseColor("rgb(300, 0, 0)");
  assert.ok(p);
  assert.equal(p.rgb[0], 1);
  const a = parseColor("rgba(0,0,0,5)");
  assert.ok(a);
  assert.equal(a.alpha, 1);
});

test("parseColor: rejects junk, bad hex length, percentages", () => {
  assert.equal(parseColor("not-a-color"), null);
  assert.equal(parseColor("#12345"), null);
  assert.equal(parseColor("#xyzxyz"), null);
  // Percentage rgb() is not yet supported; documented as null.
  assert.equal(parseColor("rgb(50%, 0, 0)"), null);
});

test("parseColor: hsl() produces a sensible rgb (mid blue)", () => {
  const p = parseColor("hsl(210, 50%, 50%)");
  assert.ok(p);
  // 210deg / 50% / 50% -> sRGB ~ (0.25, 0.5, 0.75): blue dominant, red least.
  close(p.rgb[0], 0.25, 1e-3);
  close(p.rgb[1], 0.5, 1e-3);
  close(p.rgb[2], 0.75, 1e-3);
  assert.ok(p.rgb[2] > p.rgb[1] && p.rgb[1] > p.rgb[0]);
  assert.equal(p.alpha, 1);
});

test("parseColor: CSS named color (rebeccapurple)", () => {
  const p = parseColor("rebeccapurple");
  assert.ok(p);
  close(p.rgb[0], 0.4, 1e-3);
  close(p.rgb[1], 0.2, 1e-3);
  close(p.rgb[2], 0.6, 1e-3);
  assert.equal(p.alpha, 1);
});

test("parseColor: transparent keyword has alpha 0", () => {
  const p = parseColor("transparent");
  assert.ok(p);
  assert.equal(p.alpha, 0);
});

test("parseColor: lab() reference white and red", () => {
  const white = parseColor("lab(100 0 0)");
  assert.ok(white);
  close(white.rgb[0] * 255, 255, 1);
  close(white.rgb[1] * 255, 255, 1);
  close(white.rgb[2] * 255, 255, 1);

  // sRGB red ~ lab(53.24 80.09 67.20).
  const red = parseColor("lab(53.24 80.09 67.20)");
  assert.ok(red);
  close(red.rgb[0] * 255, 255, 2);
  close(red.rgb[1] * 255, 0, 3);
  close(red.rgb[2] * 255, 0, 3);
});

test("parseColor: lch() red matches its lab() polar form", () => {
  // C = hypot(80.09, 67.20) ~ 104.55, H = atan2(67.20, 80.09) ~ 40deg.
  const red = parseColor("lch(53.24 104.55 40)");
  assert.ok(red);
  close(red.rgb[0] * 255, 255, 2);
  close(red.rgb[1] * 255, 0, 3);
  close(red.rgb[2] * 255, 0, 3);
});

test("parseColor: oklch() white, black, and red (Tailwind v4's default space)", () => {
  const white = parseColor("oklch(1 0 0)");
  assert.ok(white);
  close(white.rgb[0] * 255, 255, 1);
  close(white.rgb[1] * 255, 255, 1);
  close(white.rgb[2] * 255, 255, 1);

  const black = parseColor("oklch(0 0 0)");
  assert.ok(black);
  close(black.rgb[0] * 255, 0, 1);

  // sRGB red ~ oklch(0.628 0.2577 29.23).
  const red = parseColor("oklch(0.628 0.2577 29.23)");
  assert.ok(red);
  assert.ok(red.rgb[0] > red.rgb[1] && red.rgb[0] > red.rgb[2], "red dominant");
  close(red.rgb[0] * 255, 255, 4);
  close(red.rgb[1] * 255, 0, 5);
});

test("parseColor: oklab() red ~ oklch() red (rectangular vs polar)", () => {
  const a = parseColor("oklab(0.628 0.2249 0.1258)");
  const b = parseColor("oklch(0.628 0.2577 29.23)");
  assert.ok(a && b);
  close(a.rgb[0], b.rgb[0], 0.02);
  close(a.rgb[1], b.rgb[1], 0.02);
  close(a.rgb[2], b.rgb[2], 0.02);
});

test("parseColor: hwb() pure hue, white, black, and turn-angle hue", () => {
  const red = parseColor("hwb(0 0% 0%)");
  assert.ok(red);
  close(red.rgb[0] * 255, 255, 1);
  close(red.rgb[1] * 255, 0, 1);
  close(red.rgb[2] * 255, 0, 1);

  const white = parseColor("hwb(0 100% 0%)");
  assert.ok(white);
  close(white.rgb[0] * 255, 255, 1);
  close(white.rgb[2] * 255, 255, 1);

  const black = parseColor("hwb(0 0% 100%)");
  assert.ok(black);
  close(black.rgb[0] * 255, 0, 1);

  // 0.5turn = 180deg = cyan.
  const cyan = parseColor("hwb(0.5turn 0% 0%)");
  assert.ok(cyan);
  close(cyan.rgb[0] * 255, 0, 1);
  close(cyan.rgb[1] * 255, 255, 1);
  close(cyan.rgb[2] * 255, 255, 1);
});

test("parseColor: modern functions parse alpha (/ A) and 'none' channels", () => {
  const a = parseColor("oklch(0.7 0.1 200 / 0.5)");
  assert.ok(a);
  close(a.alpha, 0.5, 1e-6);

  const pct = parseColor("oklch(0.7 0.1 200 / 50%)");
  assert.ok(pct);
  close(pct.alpha, 0.5, 1e-6);

  const none = parseColor("oklch(none 0 0)");
  assert.ok(none);
  close(none.rgb[0] * 255, 0, 1); // L=0 -> black
});

test("parseColor: out-of-gamut oklch is clamped into 0..1", () => {
  const p = parseColor("oklch(0.9 0.4 140)"); // very saturated green, beyond sRGB
  assert.ok(p);
  for (const c of p.rgb) assert.ok(c >= 0 && c <= 1, `channel ${c} in gamut`);
});

test("parseColor: color() remains unsupported (null)", () => {
  assert.equal(parseColor("color(srgb 1 0 0)"), null);
  assert.equal(parseColor("color(display-p3 1 0 0)"), null);
});

test("nearestNamedColor: pure red maps to 'red'", () => {
  assert.equal(nearestNamedColor([1, 0, 0]), "red");
});

test("stableColorId: deterministic and of form name-hash", () => {
  const id1 = stableColorId("#3a7bd5", "cornflowerblue");
  const id2 = stableColorId("#3a7bd5", "cornflowerblue");
  assert.equal(id1, id2);
  assert.match(id1, /^cornflowerblue-[0-9a-z]{7}$/);
  // Different canonical -> different hash suffix (stable per content).
  assert.notEqual(stableColorId("#e23744", "crimson"), id1);
});

test("clusterColors: empty input returns empty", () => {
  assert.deepEqual(clusterColors([]), []);
});

test("clusterColors: merges perceptually-identical, keeps distinct", () => {
  const declared = [
    { value: "#3a7bd5", count: 40 },
    { value: "#3b7cd6", count: 5 },
    { value: "rgb(58, 123, 213)", count: 2 },
    { value: "#e23744", count: 12 },
  ];
  const colors = declared
    .map((c) => {
      const p = parseColor(c.value);
      return p ? { value: c.value, rgb: p.rgb, count: c.count } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const clusters = clusterColors(colors);
  assert.equal(clusters.length, 2);
  // Sorted by totalCount desc: blue cluster first.
  assert.equal(clusters[0].canonical, "#3a7bd5");
  assert.equal(clusters[0].totalCount, 47);
  assert.equal(clusters[0].members.length, 3);
  assert.equal(clusters[1].canonical, "#e23744");
  assert.equal(clusters[1].lab.length, 3);
});

test("clusterColors: canonical is highest-count member", () => {
  const clusters = clusterColors([
    { value: "a", rgb: [0.5, 0.5, 0.5], count: 1 },
    { value: "b", rgb: [0.5, 0.5, 0.5], count: 99 },
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].canonical, "b");
});

test("DEFAULT_DELTA_E is the documented JND threshold", () => {
  assert.equal(DEFAULT_DELTA_E, 2.0);
});

test("deltaE2000: identity is zero, symmetric", () => {
  const a = rgbToLab([0.2, 0.4, 0.6]);
  const b = rgbToLab([0.2, 0.4, 0.61]);
  assert.equal(deltaE2000(a, a), 0);
  close(deltaE2000(a, b), deltaE2000(b, a), 1e-9);
  assert.ok(deltaE2000(a, b) > 0);
});

test("deltaE2000: Sharma 2005 reference pairs", () => {
  // Published CIEDE2000 test data (Sharma, Wu & Dalal 2005, table 1).
  close(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]), 2.0425, 1e-4);
  close(deltaE2000([50, 2.5, 0], [73, 25, -18]), 27.1492, 1e-4);
  close(deltaE2000([50, 2.5, 0], [50, 3.2972, 0]), 1.0, 1e-4);
});

test("deltaE2000: black vs white is ~100 (anchors the threshold scale)", () => {
  const d = deltaE2000(rgbToLab([0, 0, 0]), rgbToLab([1, 1, 1]));
  close(d, 100, 0.5);
});

test("deltaE76: black vs white is ~100 (anchors the threshold scale)", () => {
  // The whole clustering pipeline gates on this magnitude; pin a known pair so
  // a sign or scale regression in the formula can't pass silently.
  const d = deltaE76(rgbToLab([0, 0, 0]), rgbToLab([1, 1, 1]));
  close(d, 100, 0.5);
});

test("clusterColors: chains do not merge — spread is bounded by threshold", () => {
  // Three grays where each adjacent pair is within threshold but the endpoints
  // are not. The old single-linkage pass merged all three transitively;
  // leader clustering must split the far endpoint into its own cluster.
  const chain = [
    { value: "A", rgb: [0.5, 0.5, 0.5] as const, count: 3 },
    { value: "B", rgb: [0.515, 0.515, 0.515] as const, count: 2 },
    { value: "C", rgb: [0.53, 0.53, 0.53] as const, count: 1 },
  ];
  const labs = chain.map((c) => rgbToLab(c.rgb));
  const ab = deltaE2000(labs[0], labs[1]);
  const bc = deltaE2000(labs[1], labs[2]);
  const ac = deltaE2000(labs[0], labs[2]);
  assert.ok(
    ab <= DEFAULT_DELTA_E && bc <= DEFAULT_DELTA_E,
    "adjacent in threshold",
  );
  assert.ok(ac > DEFAULT_DELTA_E, "endpoints out of threshold");

  const clusters = clusterColors(chain);
  assert.equal(clusters.length, 2);
  // Every member sits within threshold of its cluster's canonical.
  for (const cluster of clusters) {
    for (const member of cluster.members) {
      const input = chain.find((c) => c.value === member)!;
      assert.ok(
        deltaE2000(
          rgbToLab(input.rgb),
          rgbToLab(clusterCanonicalRgb(cluster, chain)),
        ) <= DEFAULT_DELTA_E,
        `${member} within threshold of ${cluster.canonical}`,
      );
    }
  }

  function clusterCanonicalRgb(
    cluster: { canonical: string },
    inputs: readonly {
      value: string;
      rgb: readonly [number, number, number];
    }[],
  ) {
    return inputs.find((c) => c.value === cluster.canonical)!.rgb;
  }
});

test("clusterColors: pageCount counts distinct pages, 0 without page info", () => {
  const clusters = clusterColors([
    { value: "#111111", rgb: [0.066, 0.066, 0.066], count: 5, page: "/" },
    { value: "#111112", rgb: [0.067, 0.066, 0.066], count: 3, page: "/about" },
    { value: "#111111", rgb: [0.066, 0.066, 0.066], count: 2, page: "/" },
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].pageCount, 2);

  const noPage = clusterColors([
    { value: "x", rgb: [0.5, 0.5, 0.5], count: 1 },
  ]);
  assert.equal(noPage[0].pageCount, 0);
});

test("NAMED_COLORS: every value is a valid lowercase 6- or 8-digit hex string", () => {
  const hex = /^#[0-9a-f]{6}([0-9a-f]{2})?$/;
  for (const [name, value] of Object.entries(NAMED_COLORS)) {
    assert.equal(name, name.toLowerCase(), `key ${name} should be lowercase`);
    assert.match(
      value,
      hex,
      `${name} -> ${value} should be a lowercase hex string`,
    );
  }
});

test("NAMED_COLORS: a few known CSS Level 4 keywords resolve correctly", () => {
  assert.equal(NAMED_COLORS.red, "#ff0000");
  assert.equal(NAMED_COLORS.black, "#000000");
  assert.equal(NAMED_COLORS.white, "#ffffff");
  assert.equal(NAMED_COLORS.cornflowerblue, "#6495ed");
  assert.equal(NAMED_COLORS.transparent, "#00000000");
});

test("NAMED_COLORS: covers the full CSS Color Module Level 4 named-color set", () => {
  // Locks in the count so a future accidental edit (typo'd key, dropped
  // entry) shows up as a failing test, not a silent gap. named.ts's own
  // header comment documents the source: CSS Color Module Level 4 keywords.
  assert.equal(Object.keys(NAMED_COLORS).length, 149);
});

test("hashString: deterministic, base36, and exactly 7 characters", () => {
  const h1 = hashString("#3a7bd5");
  const h2 = hashString("#3a7bd5");
  assert.equal(h1, h2);
  assert.equal(h1.length, 7);
  assert.match(h1, /^[0-9a-z]{7}$/);
});

test("hashString: different input produces a different hash (no trivial collision)", () => {
  assert.notEqual(hashString("#3a7bd5"), hashString("#3a7bd6"));
  assert.notEqual(hashString(""), hashString("a"));
});

test("hashString: empty string still hashes to a well-formed 7-char id", () => {
  assert.match(hashString(""), /^[0-9a-z]{7}$/);
});
