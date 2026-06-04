// End-to-end smoke test for inspectSite: drive real Chromium against the local
// fixture and assert the full report (tokens incl. motion, assets, animations,
// stack). Imports the built output for the same reason as extract.smoke.test.ts
// (Playwright serializes page-side collectors; tsx/esbuild would inject a
// `__name` helper that is undefined in the browser). Requires `npm run build`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { inspectSite } from "../dist/index.js";

const fixture = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample.html"),
).href;

test("inspectSite: returns tokens (with motion), animations, assets, and stack", async () => {
  const report = await inspectSite(fixture, { breakpoints: [1280], top: 1 });

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
});
