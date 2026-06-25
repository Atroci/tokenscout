// Pure unit tests for normaliseSvg, hashSvg, and buildIconManifest.
// No browser required. Run via tsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseSvg,
  hashSvg,
  buildIconManifest,
  type RawSvgRef,
} from "../src/harvest-icons.js";

// ---------------------------------------------------------------------------
// normaliseSvg
// ---------------------------------------------------------------------------

test("normaliseSvg: strips id attributes", () => {
  const input = '<svg id="icon-42" viewBox="0 0 24 24"></svg>';
  const result = normaliseSvg(input);
  assert.ok(!result.includes('id="icon-42"'), "id attribute should be removed");
  assert.ok(result.includes('viewBox="0 0 24 24"'), "viewBox should remain");
});

test("normaliseSvg: strips class attributes", () => {
  const input = '<svg class="icon icon--sm" viewBox="0 0 16 16"></svg>';
  const result = normaliseSvg(input);
  assert.ok(!result.includes("class="), "class attribute should be removed");
});

test("normaliseSvg: strips both id and class, collapses whitespace", () => {
  const input =
    '<svg   id="a"  class="b">\n  <path   d="M0 0"/>\n</svg>';
  const result = normaliseSvg(input);
  assert.ok(!result.includes("id="));
  assert.ok(!result.includes("class="));
  assert.ok(!result.includes("\n"));
  assert.ok(!result.includes("  "), "extra spaces should be collapsed");
});

test("normaliseSvg: single-quoted id and class are also stripped", () => {
  const input = "<svg id='foo' class='bar'><path/></svg>";
  const result = normaliseSvg(input);
  assert.ok(!result.includes("id="));
  assert.ok(!result.includes("class="));
});

test("normaliseSvg: returns trimmed output", () => {
  const input = "   <svg></svg>   ";
  assert.equal(normaliseSvg(input), "<svg></svg>");
});

// ---------------------------------------------------------------------------
// hashSvg
// ---------------------------------------------------------------------------

test("hashSvg: produces an 8-character string", () => {
  const h = hashSvg("<svg viewBox='0 0 24 24'><path d='M0 0'/></svg>");
  assert.equal(h.length, 8, `expected 8 chars, got ${h.length}`);
});

test("hashSvg: is stable — same input always yields same output", () => {
  const svg = "<svg><circle r='10'/></svg>";
  assert.equal(hashSvg(svg), hashSvg(svg));
});

test("hashSvg: different inputs produce different hashes", () => {
  const h1 = hashSvg("<svg><path d='M0 0'/></svg>");
  const h2 = hashSvg("<svg><path d='M1 1'/></svg>");
  assert.notEqual(h1, h2);
});

test("hashSvg: empty string produces an 8-character string", () => {
  const h = hashSvg("");
  assert.equal(h.length, 8);
});

// ---------------------------------------------------------------------------
// buildIconManifest
// ---------------------------------------------------------------------------

function makeRef(html: string, overrides: Partial<RawSvgRef> = {}): RawSvgRef {
  return {
    html,
    viewBox: "0 0 24 24",
    width: 24,
    height: 24,
    label: null,
    isInteractive: false,
    ...overrides,
  };
}

const SVG_A = '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>';
const SVG_B = '<svg viewBox="0 0 16 16"><circle r="8"/></svg>';

test("buildIconManifest: empty input yields empty icons array", () => {
  assert.deepEqual(buildIconManifest([]), { icons: [] });
});

test("buildIconManifest: single ref produces one icon with count=1", () => {
  const { icons } = buildIconManifest([makeRef(SVG_A)]);
  assert.equal(icons.length, 1);
  assert.equal(icons[0].count, 1);
});

test("buildIconManifest: deduplicates identical SVGs and counts occurrences", () => {
  const refs = [makeRef(SVG_A), makeRef(SVG_A), makeRef(SVG_A)];
  const { icons } = buildIconManifest(refs);
  assert.equal(icons.length, 1, "should deduplicate to one icon");
  assert.equal(icons[0].count, 3, "count should reflect all occurrences");
});

test("buildIconManifest: IDs and classes do not prevent deduplication", () => {
  // Same shape, different id/class per instance — should still merge.
  const ref1 = makeRef('<svg id="icon-1" class="sm" viewBox="0 0 24 24"><path d="M0 0"/></svg>');
  const ref2 = makeRef('<svg id="icon-2" class="lg" viewBox="0 0 24 24"><path d="M0 0"/></svg>');
  const { icons } = buildIconManifest([ref1, ref2]);
  assert.equal(icons.length, 1, "normalised duplicates should merge");
  assert.equal(icons[0].count, 2);
});

test("buildIconManifest: distinct SVGs produce separate icons", () => {
  const { icons } = buildIconManifest([makeRef(SVG_A), makeRef(SVG_B)]);
  assert.equal(icons.length, 2);
});

test("buildIconManifest: sorts by count descending", () => {
  const refs = [
    makeRef(SVG_B),                 // 1 occurrence
    makeRef(SVG_A),
    makeRef(SVG_A),
    makeRef(SVG_A),                 // 3 occurrences
  ];
  const { icons } = buildIconManifest(refs);
  assert.equal(icons.length, 2);
  assert.equal(icons[0].count, 3, "highest count should come first");
  assert.equal(icons[1].count, 1);
});

test("buildIconManifest: keeps first occurrence metadata (viewBox, label, isInteractive)", () => {
  const first = makeRef(SVG_A, {
    viewBox: "0 0 24 24",
    label: "close",
    isInteractive: true,
    width: 24,
    height: 24,
  });
  const second = makeRef(SVG_A, {
    viewBox: "0 0 48 48",
    label: "dismiss",
    isInteractive: false,
    width: 48,
    height: 48,
  });
  const { icons } = buildIconManifest([first, second]);
  assert.equal(icons.length, 1);
  assert.equal(icons[0].viewBox, "0 0 24 24", "first occurrence viewBox should win");
  assert.equal(icons[0].label, "close", "first occurrence label should win");
  assert.equal(icons[0].isInteractive, true, "first occurrence isInteractive should win");
});

test("buildIconManifest: hash is an 8-character string", () => {
  const { icons } = buildIconManifest([makeRef(SVG_A)]);
  assert.equal(icons[0].hash.length, 8);
});

test("buildIconManifest: svg field holds normalised markup", () => {
  const ref = makeRef('<svg id="x" class="y" viewBox="0 0 24 24"><path d="M0 0"/></svg>');
  const { icons } = buildIconManifest([ref]);
  assert.ok(!icons[0].svg.includes("id="), "normalised svg should not contain id");
  assert.ok(!icons[0].svg.includes("class="), "normalised svg should not contain class");
});
