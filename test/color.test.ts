// Zero-new-runtime-dep test suite using node:test. Run via tsx (dev dep).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rgbToLab,
  deltaE76,
  parseColor,
  clusterColors,
  DEFAULT_DELTA_E,
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
  assert.equal(DEFAULT_DELTA_E, 2.5);
});
