// Pure unit tests for diffStates(). No browser required.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffStates } from "../src/capture-states.js";
import type { ElementState } from "../src/capture-states.js";

test("diffStates: identical states produce an empty diffs array", () => {
  const state: ElementState = {
    selector: ".hero",
    styles: { opacity: "1", color: "rgb(0, 0, 0)", fontSize: "16px" },
  };
  const result = diffStates(state, state);
  assert.equal(result.selector, ".hero");
  assert.deepEqual(result.diffs, []);
});

test("diffStates: one changed property produces one CssDiff entry", () => {
  const before: ElementState = {
    selector: ".nav",
    styles: { opacity: "0", color: "rgb(255, 255, 255)" },
  };
  const after: ElementState = {
    selector: ".nav",
    styles: { opacity: "1", color: "rgb(255, 255, 255)" },
  };
  const result = diffStates(before, after);
  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].property, "opacity");
  assert.equal(result.diffs[0].before, "0");
  assert.equal(result.diffs[0].after, "1");
});

test("diffStates: multiple changed properties produce multiple CssDiff entries", () => {
  const before: ElementState = {
    selector: ".card",
    styles: { opacity: "0", transform: "translateY(20px)", backgroundColor: "transparent" },
  };
  const after: ElementState = {
    selector: ".card",
    styles: { opacity: "1", transform: "translateY(0px)", backgroundColor: "rgb(255,255,255)" },
  };
  const result = diffStates(before, after);
  assert.equal(result.diffs.length, 3);
  const props = result.diffs.map((d) => d.property);
  assert.ok(props.includes("opacity"));
  assert.ok(props.includes("transform"));
  assert.ok(props.includes("backgroundColor"));
});

test("diffStates: property present in before but absent in after counts as a change", () => {
  const before: ElementState = {
    selector: ".tooltip",
    styles: { display: "block" },
  };
  const after: ElementState = {
    selector: ".tooltip",
    styles: {},
  };
  const result = diffStates(before, after);
  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0].property, "display");
  assert.equal(result.diffs[0].before, "block");
  assert.equal(result.diffs[0].after, "");
});

test("diffStates: both-absent properties are not reported as changes", () => {
  const before: ElementState = {
    selector: ".btn",
    styles: { color: "red" },
  };
  const after: ElementState = {
    selector: ".btn",
    styles: { color: "blue" },
  };
  // opacity is not set in either — must not appear in diffs
  const result = diffStates(before, after);
  const props = result.diffs.map((d) => d.property);
  assert.ok(!props.includes("opacity"));
  assert.equal(result.diffs.length, 1);
});
