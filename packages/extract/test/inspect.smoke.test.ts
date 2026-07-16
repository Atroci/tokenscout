// End-to-end smoke test for inspectSite: drive real Chromium against the local
// fixture and assert the full report (tokens incl. motion, assets, animations,
// stack). Imports the built output for the same reason as extract.smoke.test.ts
// (Playwright serializes page-side collectors; tsx/esbuild would inject a
// `__name` helper that is undefined in the browser). Requires `npm run build`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { inspectSite, type ProgressEvent } from "../dist/index.js";

const fixture = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample.html"),
).href;

test("inspectSite: returns tokens (with motion), animations, assets, and stack", async () => {
  const progress: ProgressEvent[] = [];
  const report = await inspectSite(fixture, {
    breakpoints: [1280],
    top: 1,
    onProgress: (event) => progress.push(event),
  });

  assert.equal(report.url, fixture);
  assert.equal(report.pages.length, 1);

  // Existing token groups still come through the composed path.
  assert.ok(report.tokens.color, "color group present");
  assert.ok(report.tokens.fontSize, "fontSize group present");

  // Motion: the fixture has a 0.3s transition and a 500ms animation, so the
  // animation tokens and the DTCG duration group should both reflect 300 + 500.
  assert.deepEqual(report.animations.durations, [300, 500]);
  assert.ok(report.animations.keyframes.includes("fade-in"));
  const duration = report.tokens.duration as Record<
    string,
    { $value: { value: number; unit: string }; $type: string }
  >;
  assert.ok(duration, "duration group present in tokens");
  assert.deepEqual(duration["duration-1"].$value, { value: 300, unit: "ms" });
  assert.deepEqual(duration["duration-2"].$value, { value: 500, unit: "ms" });

  // Assets: a file:// fixture has no http(s) assets, so the manifest is empty,
  // but the shape must be present.
  assert.ok(Array.isArray(report.assets.assets));

  // Stack: a plain static page yields a profile object with no frameworks.
  assert.ok(report.stack && Array.isArray(report.stack.frameworks));

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
      "assets.started",
      "assets.completed",
      "animations.started",
      "animations.completed",
      "stack.started",
      "stack.completed",
      "icons.started",
      "icons.completed",
      "topology.started",
      "topology.completed",
      "interaction.started",
      "interaction.completed",
      "tokens.started",
      "tokens.completed",
      "run.completed",
    ],
  );
  assert.equal(
    progress.some((event) => event.phase === "screenshot"),
    false,
    "inspectSite must not claim screenshot work",
  );
  assert.equal(
    progress.find(
      (event) => event.phase === "assets" && event.status === "completed",
    )?.detail?.assets,
    report.assets.assets.length,
  );
  assert.equal(
    progress.find(
      (event) => event.phase === "icons" && event.status === "completed",
    )?.detail?.icons,
    report.icons.icons.length,
  );
  assert.equal(
    progress.find(
      (event) => event.phase === "topology" && event.status === "completed",
    )?.detail?.sections,
    report.topology?.count,
  );
  assert.equal(
    progress.find(
      (event) => event.phase === "interaction" && event.status === "completed",
    )?.detail?.interactionType,
    report.interaction?.type,
  );
});

test("inspectSite: disabled collectors emit one skipped event each", async () => {
  const progress: ProgressEvent[] = [];
  await inspectSite(fixture, {
    breakpoints: [1280],
    top: 1,
    assets: false,
    animations: false,
    stack: false,
    icons: false,
    topology: false,
    interaction: false,
    onProgress: (event) => progress.push(event),
  });

  assert.deepEqual(
    progress
      .filter((event) => event.status === "skipped")
      .map((event) => event.phase),
    ["assets", "animations", "stack", "icons", "topology", "interaction"],
  );
  for (const phase of [
    "assets",
    "animations",
    "stack",
    "icons",
    "topology",
    "interaction",
  ]) {
    assert.equal(
      progress.filter((event) => event.phase === phase).length,
      1,
      `${phase} should emit only its skipped state`,
    );
  }
});
