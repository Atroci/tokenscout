// Pure aggregation tests for harvest(). No browser. Run via tsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { harvest } from "../src/harvest.js";

test("harvest: counts colors by (value, role)", () => {
  const page = harvest("https://example.com/", 1280, {
    colors: [
      { value: "rgb(58, 123, 213)", role: "background-color" },
      { value: "rgb(58, 123, 213)", role: "background-color" },
      { value: "rgb(58, 123, 213)", role: "color" },
      { value: "rgb(226, 55, 68)", role: "color" },
    ],
    fontSizes: ["16px", "32px"],
    spacing: ["8px", "24px"],
  });

  assert.equal(page.url, "https://example.com/");
  assert.equal(page.breakpoint, 1280);
  // Same value under two roles stays two observations; same (value, role) merges.
  const bg = page.colors.find(
    (c) => c.value === "rgb(58, 123, 213)" && c.role === "background-color",
  );
  assert.equal(bg?.count, 2);
  const fg = page.colors.find(
    (c) => c.value === "rgb(58, 123, 213)" && c.role === "color",
  );
  assert.equal(fg?.count, 1);
  assert.equal(page.colors.length, 3);
});

test("harvest: passes type and spacing through into the seam shape", () => {
  const page = harvest("https://example.com/", 375, {
    colors: [],
    fontSizes: ["16px"],
    spacing: ["8px", "16px"],
  });
  assert.deepEqual(page.type, { sizes: ["16px"] });
  assert.deepEqual(page.spacing, { values: ["8px", "16px"] });
  assert.deepEqual(page.colors, []);
});
