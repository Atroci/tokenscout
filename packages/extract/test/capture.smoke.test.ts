// Capture-worker smoke test against real Chromium + a temp filesystem dir.
// Imports the built output (page-side collector serialization). Requires a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureSite } from "../dist/index.js";

const html = `<!doctype html><html><head><style>
  @keyframes s { to { transform: rotate(360deg) } }
  .x { width:50px;height:50px;background:red;animation: s 2s linear infinite; }
</style></head><body><div class="x"></div></body></html>`;
const url = "data:text/html;charset=utf-8," + encodeURIComponent(html);

test("captureSite: writes light+dark screenshots, runtime motion, and a manifest", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "tokenscout-capture-"));
  try {
    const reports = await captureSite(url, { outDir });

    assert.equal(reports.length, 1);
    const [report] = reports;
    assert.equal(report.url, url);
    assert.deepEqual(
      report.captures.map((c) => c.theme),
      ["light", "dark"],
    );
    // The infinite spin is live in both states.
    assert.ok(report.captures[0].motion.properties.composited.includes("transform"));

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
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
