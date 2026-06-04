// End-to-end smoke test: drive real Chromium against a local fixture, then run
// the extract through the core's assembleTokens. Requires `playwright` and an
// installed Chromium (CI: `npx playwright install --with-deps chromium`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { assembleTokens } from "tokenscout/tokens";
// Import the built output, not src: Playwright serializes the page-side
// collector with Function.toString(), and running src through tsx/esbuild
// injects a `__name` helper that is undefined in the browser context. The
// shipped tsc output has no such helper, so this also tests the real artifact.
// Requires `npm run build` first (the workspace test script handles ordering).
import { extractSite } from "../dist/index.js";

const fixture = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample.html"),
).href;

test("extractSite: reduces a rendered fixture to observations, then tokens", async () => {
  const pages = await extractSite(fixture, { breakpoints: [1280], top: 1 });

  assert.equal(pages.length, 1);
  const page = pages[0];
  assert.equal(page.breakpoint, 1280);
  assert.ok(page.colors.length > 0, "should observe at least one color");
  assert.ok(page.type.sizes.length > 0, "should observe font sizes");
  assert.ok(page.spacing.values.length > 0, "should observe spacing");

  // The fixture paints #3a7bd5 (rgb(58,123,213)) on the heading and CTA.
  assert.ok(
    page.colors.some((c) => c.value === "rgb(58, 123, 213)"),
    "should capture the brand blue from computed styles",
  );

  // The headline path: observations -> a DTCG token document with real groups.
  const tokens = assembleTokens(pages);
  assert.ok(tokens.color, "tokens should include a color group");
  assert.ok(tokens.fontSize, "tokens should include a fontSize group");
});
