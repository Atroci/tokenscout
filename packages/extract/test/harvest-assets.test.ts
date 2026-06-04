// Pure resolution/dedupe tests for buildAssetManifest(). No browser. Run via tsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAssetManifest } from "../src/harvest-assets.js";

const PAGE = "https://example.com/blog/post/";

test("buildAssetManifest: resolves relative, root-relative, and protocol-relative URLs", () => {
  const { assets } = buildAssetManifest(PAGE, [
    { url: "hero.png", kind: "image" },
    { url: "/assets/logo.svg", kind: "image" },
    { url: "//cdn.example.com/bg.jpg", kind: "background" },
    { url: "https://example.com/abs.png", kind: "image" },
  ]);

  const urls = assets.map((a) => a.url);
  assert.ok(urls.includes("https://example.com/blog/post/hero.png"));
  assert.ok(urls.includes("https://example.com/assets/logo.svg"));
  // Protocol-relative inherits the page's https scheme.
  assert.ok(urls.includes("https://cdn.example.com/bg.jpg"));
  assert.ok(urls.includes("https://example.com/abs.png"));
  assert.equal(assets.length, 4);
});

test("buildAssetManifest: drops data: and non-http(s) entries", () => {
  const { assets } = buildAssetManifest(PAGE, [
    { url: "data:image/png;base64,iVBORw0KGgo=", kind: "image" },
    { url: "blob:https://example.com/abc-123", kind: "image" },
    { url: "ftp://example.com/old.png", kind: "image" },
    { url: "mailto:hugo@vizuh.com", kind: "image" },
    { url: "keep.png", kind: "image" },
  ]);

  assert.deepEqual(assets, [
    { url: "https://example.com/blog/post/keep.png", kind: "image" },
  ]);
});

test("buildAssetManifest: dedupes by resolved URL, keeping the first kind seen", () => {
  const { assets } = buildAssetManifest(PAGE, [
    { url: "/icon.png", kind: "favicon" },
    // Same resolved URL via a relative path: first kind (favicon) wins.
    { url: "../../icon.png", kind: "image" },
    { url: "/icon.png", kind: "og-image" },
  ]);

  assert.deepEqual(assets, [
    { url: "https://example.com/icon.png", kind: "favicon" },
  ]);
});

test("buildAssetManifest: sorts by url and drops unknown kinds plus blanks", () => {
  const { assets } = buildAssetManifest(PAGE, [
    { url: "zeta.png", kind: "image" },
    { url: "alpha.png", kind: "background" },
    { url: "ignored.png", kind: "stylesheet" },
    { url: "   ", kind: "image" },
    { url: "", kind: "image" },
  ]);

  assert.deepEqual(assets, [
    { url: "https://example.com/blog/post/alpha.png", kind: "background" },
    { url: "https://example.com/blog/post/zeta.png", kind: "image" },
  ]);
});

test("buildAssetManifest: empty input yields an empty manifest", () => {
  assert.deepEqual(buildAssetManifest(PAGE, []), { assets: [] });
});
