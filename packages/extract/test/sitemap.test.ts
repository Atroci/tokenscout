// Pure parse tests for parseSitemap() plus discoverSitemapUrls() driven by a
// fake fetchImpl. No network, no browser. Run via tsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSitemap, discoverSitemapUrls } from "../src/sitemap.js";

test("parseSitemap: extracts and resolves urlset locs, dropping non-http", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/</loc></url>
      <url><loc>  https://example.com/about  </loc></url>
      <url><loc>/contact</loc></url>
      <url><loc>ftp://example.com/file</loc></url>
      <url><loc>mailto:hi@example.com</loc></url>
    </urlset>`;
  const urls = parseSitemap(xml, "https://example.com/sitemap.xml");
  assert.deepEqual(urls, [
    "https://example.com/",
    "https://example.com/about",
    "https://example.com/contact",
  ]);
});

test("parseSitemap: reads namespaced <sitemap:loc> from a sitemapindex", () => {
  const xml = `<sitemapindex xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><sm:loc>https://example.com/sitemap-pages.xml</sm:loc></sitemap>
      <sitemap><sm:loc>https://example.com/sitemap-posts.xml</sm:loc></sitemap>
    </sitemapindex>`;
  const urls = parseSitemap(xml, "https://example.com/sitemap.xml");
  assert.deepEqual(urls, [
    "https://example.com/sitemap-pages.xml",
    "https://example.com/sitemap-posts.xml",
  ]);
});

test("parseSitemap: de-duplicates preserving first-seen order and decodes entities", () => {
  const xml = `<urlset>
      <url><loc>https://example.com/a?x=1&amp;y=2</loc></url>
      <url><loc>https://example.com/dup</loc></url>
      <url><loc>https://example.com/dup</loc></url>
    </urlset>`;
  const urls = parseSitemap(xml, "https://example.com/sitemap.xml");
  assert.deepEqual(urls, [
    "https://example.com/a?x=1&y=2",
    "https://example.com/dup",
  ]);
});

test("parseSitemap: tolerates empty locs and a missing xml declaration", () => {
  const xml = `<urlset><url><loc></loc></url><url><loc>https://example.com/p</loc></url></urlset>`;
  assert.deepEqual(parseSitemap(xml, "https://example.com/"), [
    "https://example.com/p",
  ]);
});

test("parseSitemap: returns [] when there are no locs", () => {
  assert.deepEqual(
    parseSitemap("<urlset></urlset>", "https://example.com/"),
    [],
  );
});

/** Build a fake fetch that maps URL to canned body, 404s anything unmapped. */
function fakeFetch(map: Record<string, string>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = map[url];
    if (body === undefined) {
      return { ok: false, status: 404, text: async () => "" } as Response;
    }
    return { ok: true, status: 200, text: async () => body } as Response;
  }) as typeof fetch;
}

test("discoverSitemapUrls: returns page urls straight from a urlset", async () => {
  const fetchImpl = fakeFetch({
    "https://example.com/sitemap.xml": `<urlset>
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://example.com/about</loc></url>
      </urlset>`,
  });
  const urls = await discoverSitemapUrls("https://example.com/some/page", {
    fetchImpl,
  });
  assert.deepEqual(urls, ["https://example.com/", "https://example.com/about"]);
});

test("discoverSitemapUrls: flattens a sitemap index across its children", async () => {
  const fetchImpl = fakeFetch({
    "https://example.com/sitemap.xml": `<sitemapindex>
        <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
        <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
      </sitemapindex>`,
    "https://example.com/sitemap-1.xml": `<urlset>
        <url><loc>https://example.com/a</loc></url>
        <url><loc>https://example.com/b</loc></url>
      </urlset>`,
    "https://example.com/sitemap-2.xml": `<urlset>
        <url><loc>https://example.com/c</loc></url>
      </urlset>`,
  });
  const urls = await discoverSitemapUrls("https://example.com/", { fetchImpl });
  assert.deepEqual(urls, [
    "https://example.com/a",
    "https://example.com/b",
    "https://example.com/c",
  ]);
});

test("discoverSitemapUrls: applies limit to the flattened result", async () => {
  const fetchImpl = fakeFetch({
    "https://example.com/sitemap.xml": `<sitemapindex>
        <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
      </sitemapindex>`,
    "https://example.com/sitemap-1.xml": `<urlset>
        <url><loc>https://example.com/a</loc></url>
        <url><loc>https://example.com/b</loc></url>
        <url><loc>https://example.com/c</loc></url>
      </urlset>`,
  });
  const urls = await discoverSitemapUrls("https://example.com/", {
    fetchImpl,
    limit: 2,
  });
  assert.deepEqual(urls, ["https://example.com/a", "https://example.com/b"]);
});

test("discoverSitemapUrls: fails soft to [] on a rejected fetch", async () => {
  const fetchImpl = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const urls = await discoverSitemapUrls("https://example.com/", { fetchImpl });
  assert.deepEqual(urls, []);
});

test("discoverSitemapUrls: fails soft to [] on a non-200 root sitemap", async () => {
  const fetchImpl = fakeFetch({}); // every URL 404s
  const urls = await discoverSitemapUrls("https://example.com/", { fetchImpl });
  assert.deepEqual(urls, []);
});

test("discoverSitemapUrls: returns [] for an unparseable site URL", async () => {
  const urls = await discoverSitemapUrls("not a url", {
    fetchImpl: fakeFetch({}),
  });
  assert.deepEqual(urls, []);
});
