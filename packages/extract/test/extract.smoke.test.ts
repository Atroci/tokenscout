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
import {
  extractSite,
  extractTokens,
  type ProgressEvent,
} from "../dist/index.js";

const fixture = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample.html"),
).href;

test("extractSite: reduces a rendered fixture to observations, then tokens", async () => {
  const progress: ProgressEvent[] = [];
  const pages = await extractSite(fixture, {
    breakpoints: [1280, 375],
    top: 1,
    onProgress: (event) => progress.push(event),
  });

  assert.equal(pages.length, 2);
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

  assert.deepEqual(
    progress.map((event) => `${event.phase}.${event.status}`),
    [
      "run.started",
      "browser.started",
      "browser.completed",
      "discovery.started",
      "discovery.completed",
      "viewport.started",
      "viewport.completed",
      "viewport.started",
      "viewport.completed",
      "run.completed",
    ],
  );
  const viewports = progress.filter(
    (event) => event.phase === "viewport" && event.status === "completed",
  );
  assert.deepEqual(
    viewports.map((event) => ({
      url: event.url,
      breakpoint: event.breakpoint,
      current: event.current,
      total: event.total,
    })),
    [
      { url: fixture, breakpoint: 1280, current: 1, total: 2 },
      { url: fixture, breakpoint: 375, current: 2, total: 2 },
    ],
  );
  assert.equal(viewports[0].detail?.colors, page.colors.length);
  assert.equal(viewports[0].detail?.typeSizes, page.type.sizes.length);
  assert.equal(viewports[0].detail?.spacingValues, page.spacing.values.length);
  assert.equal(progress[0].detail?.operation, "extract-site");
  assert.deepEqual(
    progress.find(
      (event) => event.phase === "discovery" && event.status === "completed",
    )?.detail,
    { method: "target", pages: 1 },
  );
});

test("extractTokens: emits one run lifecycle and token reduction progress", async () => {
  const progress: ProgressEvent[] = [];
  const tokens = await extractTokens(fixture, {
    breakpoints: [1280],
    top: 1,
    onProgress: (event) => {
      progress.push(event);
      if (event.phase === "browser" && event.status === "completed") {
        throw new Error("renderer failed");
      }
    },
  });

  assert.ok(tokens.color, "tokens should include a color group");
  assert.deepEqual(
    progress.map((event) => `${event.phase}.${event.status}`),
    [
      "run.started",
      "browser.started",
      "browser.completed",
      "discovery.started",
      "discovery.completed",
      "viewport.started",
      "viewport.completed",
      "tokens.started",
      "tokens.completed",
      "run.completed",
    ],
  );
  assert.equal(
    progress.filter(
      (event) => event.phase === "run" && event.status === "started",
    ).length,
    1,
  );
  assert.equal(
    progress.filter(
      (event) => event.phase === "run" && event.status === "completed",
    ).length,
    1,
  );
  assert.equal(progress[0].detail?.operation, "extract-tokens");
  assert.equal(
    progress.find(
      (event) => event.phase === "tokens" && event.status === "completed",
    )?.detail?.groups,
    Object.keys(tokens).filter((key) => !key.startsWith("$")).length,
  );
});

test("extractSite: reports viewport and run failure without replacing the error", async () => {
  const progress: ProgressEvent[] = [];
  const missing = pathToFileURL(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures", "missing.html"),
  ).href;
  let caught: unknown;

  try {
    await extractSite(missing, {
      breakpoints: [1280],
      top: 1,
      onProgress: (event) => progress.push(event),
    });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof Error);
  assert.deepEqual(
    progress.slice(-2).map((event) => `${event.phase}.${event.status}`),
    ["viewport.failed", "run.failed"],
  );
  assert.equal(progress.at(-2)?.error, caught.message);
  assert.equal(progress.at(-1)?.error, caught.message);
});
