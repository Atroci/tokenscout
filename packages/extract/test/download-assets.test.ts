// Tests for download-assets: the pure assetFilename plus a downloadAssets run
// against a fake fetch into a temp directory (no network). Run via tsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assetFilename, downloadAssets } from "../src/download-assets.js";
import type { AssetManifest } from "../src/harvest-assets.js";

test("assetFilename: uses the last path segment, ignoring query and hash", () => {
  assert.equal(
    assetFilename("https://x.com/img/logo.png?v=2#a", new Set()),
    "logo.png",
  );
  assert.equal(
    assetFilename("https://x.com/a/b/hero.jpg", new Set()),
    "hero.jpg",
  );
});

test("assetFilename: falls back to 'asset' for root or trailing-slash URLs", () => {
  assert.equal(assetFilename("https://x.com/", new Set()), "asset");
  assert.equal(assetFilename("https://x.com", new Set()), "asset");
});

test("assetFilename: sanitizes unsafe characters", () => {
  assert.equal(
    assetFilename("https://x.com/a/my%20logo@2x!.png", new Set()),
    "my-logo-2x-.png",
  );
});

test("assetFilename: dedupes by inserting a counter before the extension", () => {
  const taken = new Set<string>(["logo.png"]);
  assert.equal(assetFilename("https://x.com/logo.png", taken), "logo-1.png");
  taken.add("logo-1.png");
  assert.equal(assetFilename("https://x.com/logo.png", taken), "logo-2.png");
  // No extension: counter appended at the end.
  const t2 = new Set<string>(["data"]);
  assert.equal(assetFilename("https://x.com/data", t2), "data-1");
});

test("downloadAssets: writes successes, records failures, emits manifest.json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tokenscout-assets-"));
  try {
    const manifest: AssetManifest = {
      assets: [
        { url: "https://x.com/logo.png", kind: "image" },
        { url: "https://x.com/missing.png", kind: "image" },
        { url: "https://x.com/boom.png", kind: "background" },
      ],
    };

    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("logo.png")) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => new TextEncoder().encode("PNGDATA").buffer,
        } as Response;
      }
      if (url.endsWith("missing.png")) {
        return {
          ok: false,
          status: 404,
          arrayBuffer: async () => new ArrayBuffer(0),
        } as Response;
      }
      throw new Error("network down");
    }) as typeof fetch;

    const report = await downloadAssets(manifest, dir, {
      fetchImpl: fakeFetch,
    });

    assert.equal(report.downloaded.length, 1);
    assert.equal(report.downloaded[0].file, "logo.png");
    assert.equal(report.downloaded[0].bytes, 7);
    assert.equal(report.failed.length, 2);
    assert.ok(report.failed.some((f) => f.error === "HTTP 404"));
    assert.ok(report.failed.some((f) => f.error === "network down"));

    const files = await readdir(dir);
    assert.ok(files.includes("logo.png"));
    assert.ok(files.includes("manifest.json"));
    assert.equal(await readFile(join(dir, "logo.png"), "utf8"), "PNGDATA");
    const written = JSON.parse(
      await readFile(join(dir, "manifest.json"), "utf8"),
    );
    assert.equal(written.downloaded.length, 1);
    assert.equal(written.failed.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
