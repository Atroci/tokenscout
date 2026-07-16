// Capture-worker smoke test against real Chromium + a temp filesystem dir.
// Imports the built output (page-side collector serialization). Requires a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureSite, type ProgressEvent } from "../dist/index.js";

const html = `<!doctype html><html><head><style>
  @keyframes s { to { transform: rotate(360deg) } }
  .x { width:50px;height:50px;background:red;animation: s 2s linear infinite; }
</style></head><body><div class="x"></div></body></html>`;
const url = "data:text/html;charset=utf-8," + encodeURIComponent(html);

test("captureSite: writes light+dark screenshots, runtime motion, and a manifest", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "tokenscout-capture-"));
  try {
    const progress: ProgressEvent[] = [];
    const reports = await captureSite(url, {
      outDir,
      onProgress: (event) => progress.push(event),
    });

    assert.equal(reports.length, 1);
    const [report] = reports;
    assert.equal(report.url, url);
    assert.deepEqual(
      report.captures.map((c) => c.theme),
      ["light", "dark"],
    );
    // The infinite spin is live in both states.
    assert.ok(
      report.captures[0].motion.properties.composited.includes("transform"),
    );

    // Screenshots exist and are non-empty on disk.
    for (const c of report.captures) {
      const s = await stat(join(outDir, c.screenshot));
      assert.ok(s.size > 0, `${c.screenshot} should be a non-empty file`);
    }

    // Manifest is written and round-trips.
    const manifest = JSON.parse(
      await readFile(join(outDir, "capture.json"), "utf8"),
    );
    assert.equal(manifest.length, 1);
    assert.equal(manifest[0].url, url);

    assert.deepEqual(
      progress.map((event) => `${event.phase}.${event.status}`),
      [
        "run.started",
        "browser.started",
        "browser.completed",
        "screenshot.started",
        "screenshot.completed",
        "screenshot.started",
        "screenshot.completed",
        "run.completed",
      ],
    );
    const screenshots = progress.filter(
      (event) => event.phase === "screenshot" && event.status === "completed",
    );
    assert.deepEqual(
      screenshots.map((event) => event.detail?.theme),
      ["light", "dark"],
    );
    assert.deepEqual(
      screenshots.map((event) => [event.current, event.total]),
      [
        [1, 2],
        [2, 2],
      ],
    );
    assert.deepEqual(
      screenshots.map((event) => event.detail?.screenshot),
      report.captures.map((capture) => capture.screenshot),
    );
    assert.deepEqual(
      screenshots.map((event) => event.detail?.width),
      [1280, 1280],
    );
    assert.deepEqual(progress.at(-1)?.detail, {
      operation: "capture-site",
      targets: 1,
      screenshots: 2,
    });
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
