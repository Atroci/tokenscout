// Pure unit tests for diffLayoutSnapshots(). No browser required.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffLayoutSnapshots } from "../src/diff-breakpoints.js";
import type { LayoutSnapshot } from "../src/diff-breakpoints.js";

test("diffLayoutSnapshots: two identical snapshots → empty changes", () => {
  const snap: LayoutSnapshot = {
    breakpoint: 1440,
    selector: ".hero",
    properties: { display: "flex", flexDirection: "row" },
  };
  const narrow: LayoutSnapshot = {
    breakpoint: 390,
    selector: ".hero",
    properties: { display: "flex", flexDirection: "row" },
  };
  const changes = diffLayoutSnapshots([snap, narrow]);
  assert.deepEqual(changes, []);
});

test("diffLayoutSnapshots: flexDirection changes desktop→mobile → one LayoutChange", () => {
  const desktop: LayoutSnapshot = {
    breakpoint: 1440,
    selector: ".hero",
    properties: { display: "flex", flexDirection: "row" },
  };
  const mobile: LayoutSnapshot = {
    breakpoint: 390,
    selector: ".hero",
    properties: { display: "flex", flexDirection: "column" },
  };
  const changes = diffLayoutSnapshots([desktop, mobile]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].property, "flexDirection");
  assert.equal(changes[0].from, "row");
  assert.equal(changes[0].to, "column");
  assert.equal(changes[0].atBreakpoint, 390);
});

test("diffLayoutSnapshots: multiple property changes are sorted by atBreakpoint desc then property asc", () => {
  const desktop: LayoutSnapshot = {
    breakpoint: 1440,
    selector: ".nav",
    properties: { display: "flex", flexDirection: "row", gap: "24px" },
  };
  const tablet: LayoutSnapshot = {
    breakpoint: 768,
    selector: ".nav",
    properties: { display: "flex", flexDirection: "column", gap: "16px" },
  };
  const changes = diffLayoutSnapshots([desktop, tablet]);
  assert.equal(changes.length, 2);
  // Both changes happen at 768, sorted by property asc: flexDirection < gap
  assert.equal(changes[0].property, "flexDirection");
  assert.equal(changes[1].property, "gap");
  assert.ok(changes.every((c) => c.atBreakpoint === 768));
});

test("diffLayoutSnapshots: atBreakpoint is the narrower viewport value", () => {
  const wide: LayoutSnapshot = {
    breakpoint: 1440,
    selector: ".sidebar",
    properties: { display: "flex" },
  };
  const mid: LayoutSnapshot = {
    breakpoint: 768,
    selector: ".sidebar",
    properties: { display: "block" },
  };
  const changes = diffLayoutSnapshots([wide, mid]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].atBreakpoint, 768);
});

test("diffLayoutSnapshots: same property changed at multiple breakpoints keeps narrowest", () => {
  const desktop: LayoutSnapshot = {
    breakpoint: 1440,
    selector: ".card",
    properties: { flexDirection: "row" },
  };
  const tablet: LayoutSnapshot = {
    breakpoint: 768,
    selector: ".card",
    properties: { flexDirection: "column" },
  };
  const mobile: LayoutSnapshot = {
    breakpoint: 390,
    selector: ".card",
    properties: { flexDirection: "row" },
  };
  const changes = diffLayoutSnapshots([desktop, tablet, mobile]);
  // flexDirection changes at 768 (row→column) and again at 390 (column→row).
  // Only the narrowest (390) survives de-duplication.
  const flexChange = changes.find((c) => c.property === "flexDirection");
  assert.ok(flexChange !== undefined);
  assert.equal(flexChange.atBreakpoint, 390);
  assert.equal(flexChange.from, "column");
  assert.equal(flexChange.to, "row");
});
