// Pure-logic tests for harvest-styles. No browser / JSDOM required.
// The browser-side collector runs inside page.evaluate(), so the tests here
// validate the pure helper functions that mirror its filtering behaviour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterStyles, extractText } from "../src/harvest-styles.js";

test("filterStyles: drops noise values (none, normal, auto, 0px, rgba(0,0,0,0), empty)", () => {
  const raw = {
    color: "rgb(30, 30, 30)",
    fontFamily: "Inter, sans-serif",
    display: "none",
    lineHeight: "normal",
    width: "auto",
    marginTop: "0px",
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderRadius: "",
  };
  const filtered = filterStyles(raw);
  assert.deepEqual(filtered, {
    color: "rgb(30, 30, 30)",
    fontFamily: "Inter, sans-serif",
  });
});

test("filterStyles: keeps all values that are not noise", () => {
  const raw = {
    fontSize: "16px",
    fontWeight: "700",
    opacity: "0.5",
  };
  const filtered = filterStyles(raw);
  assert.deepEqual(filtered, { fontSize: "16px", fontWeight: "700", opacity: "0.5" });
});

test("extractText: returns null when childCount is not 1", () => {
  assert.equal(extractText(0, false, "hello"), null);
  assert.equal(extractText(2, true, "hello"), null);
});

test("extractText: returns null when the single child is not a text node", () => {
  assert.equal(extractText(1, false, "hello"), null);
});

test("extractText: returns trimmed text (max 200 chars) for a single text-node child", () => {
  assert.equal(extractText(1, true, "  Hello World  "), "Hello World");
  const long = "a".repeat(300);
  assert.equal(extractText(1, true, long)?.length, 200);
});
