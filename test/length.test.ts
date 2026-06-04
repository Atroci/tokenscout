// Zero-new-runtime-dep test suite using node:test. Run via tsx (dev dep).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLength, DEFAULT_ROOT_PX } from "../src/length.js";

test("parseLength: parses px verbatim", () => {
  assert.equal(parseLength("16px"), 16);
  assert.equal(parseLength("0px"), 0);
  assert.equal(parseLength("23.5px"), 23.5);
});

test("parseLength: converts rem with default rootPx 16", () => {
  assert.equal(DEFAULT_ROOT_PX, 16);
  assert.equal(parseLength("1rem"), 16);
  assert.equal(parseLength("1.5rem"), 24);
});

test("parseLength: honors a custom rootPx for rem", () => {
  assert.equal(parseLength("1rem", 10), 10);
  assert.equal(parseLength("2rem", 10), 20);
});

test("parseLength: is case-insensitive and tolerates surrounding whitespace", () => {
  assert.equal(parseLength("  1REM "), 16);
  assert.equal(parseLength("16PX"), 16);
});

test("parseLength: returns null for unsupported units and junk", () => {
  for (const v of ["2em", "100%", "auto", "inherit", "16", "px", ""]) {
    assert.equal(parseLength(v), null, `expected null for ${JSON.stringify(v)}`);
  }
});

test("parseLength: preserves the (negative) sign as observed", () => {
  // The parser reports what it sees; downstream reducers decide what to drop.
  assert.equal(parseLength("-8px"), -8);
  assert.equal(parseLength("-1rem", 16), -16);
});

test("parseLength: rejects overflowing digit runs as non-finite (null)", () => {
  // A long digit run overflows a JS double to Infinity. Returning null at the
  // boundary stops that propagating into the reducers' arithmetic.
  assert.equal(parseLength("9".repeat(400) + "px"), null);
  assert.equal(parseLength("9".repeat(400) + "rem"), null);
});
