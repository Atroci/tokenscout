// Sitemap-driven page discovery. Network/IO only, no browser: uses the global
// fetch (Node 20+). The deterministic parse lives in parseSitemap() so it is
// unit-testable without any network; discoverSitemapUrls() is the thin fetch
// glue that the pure function does not depend on.

/** Match every <loc>...</loc>, tolerant of namespaces and surrounding whitespace. */
const LOC_RE =
  /<(?:[a-zA-Z][\w.-]*:)?loc\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z][\w.-]*:)?loc>/gi;

/**
 * Extract <loc> URLs from a sitemap document. Works for both a <urlset>
 * (page URLs) and a <sitemapindex> (nested sitemap URLs): the tag we read,
 * <loc>, is the same in both, so we return the raw values and let the caller
 * decide whether they are pages or child sitemaps. URLs are trimmed, resolved
 * against baseUrl, filtered to http(s), and de-duplicated preserving order.
 * Tolerant parse (regex, no XML dependency): handles missing/utf declarations,
 * self-closing siblings, and namespaced tags.
 */
export function parseSitemap(xml: string, baseUrl: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const match of xml.matchAll(LOC_RE)) {
    const raw = decodeEntities(match[1].trim());
    if (!raw) continue;

    let resolved: URL;
    try {
      resolved = new URL(raw, baseUrl);
    } catch {
      continue;
    }

    if (resolved.protocol !== "http:" && resolved.protocol !== "https:")
      continue;

    const href = resolved.href;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }

  return out;
}

/** Decode the handful of XML entities that legally appear inside a <loc>. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Tunables for discoverSitemapUrls; fetchImpl is injectable for testing. */
export interface DiscoverSitemapOptions {
  /** Cap on the total page URLs returned. No cap when omitted. */
  limit?: number;
  /** Fetch implementation to use. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** A child-sitemap cap keeps a sitemap index from fanning out unboundedly. */
const MAX_CHILD_SITEMAPS = 5;

/**
 * Fetch <origin>/sitemap.xml and return the page URLs it advertises. If the
 * document is a sitemap index (its <loc> entries point at .xml files), fetch up
 * to MAX_CHILD_SITEMAPS of those children and flatten their page URLs. Applies
 * opts.limit to the flattened result. Fails soft: any fetch error or non-200
 * yields [] (or whatever was already gathered), and the function never throws.
 */
export async function discoverSitemapUrls(
  siteUrl: string,
  opts: DiscoverSitemapOptions = {},
): Promise<string[]> {
  const { limit, fetchImpl = fetch } = opts;

  let origin: string;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    return [];
  }

  const rootUrl = `${origin}/sitemap.xml`;
  const rootXml = await fetchText(rootUrl, fetchImpl);
  if (rootXml === null) return [];

  const rootLocs = parseSitemap(rootXml, rootUrl);
  // A sitemap index lists child sitemaps (.xml); a urlset lists page URLs.
  const childSitemaps = rootLocs.filter(isXmlUrl);
  const isIndex =
    childSitemaps.length > 0 && childSitemaps.length === rootLocs.length;

  if (!isIndex) return applyLimit(rootLocs, limit);

  const seen = new Set<string>();
  const pages: string[] = [];
  for (const child of childSitemaps.slice(0, MAX_CHILD_SITEMAPS)) {
    const childXml = await fetchText(child, fetchImpl);
    if (childXml === null) continue;
    for (const url of parseSitemap(childXml, child)) {
      if (seen.has(url)) continue;
      seen.add(url);
      pages.push(url);
    }
    if (limit !== undefined && pages.length >= limit) break;
  }

  return applyLimit(pages, limit);
}

/** GET `url` and return its body text, or null on any error or non-200. */
async function fetchText(
  url: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** True when the URL's path ends in .xml (case-insensitive), ignoring query/hash. */
function isXmlUrl(url: string): boolean {
  try {
    return /\.xml$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Slice to `limit` when one is given; otherwise pass the list through. */
function applyLimit(urls: string[], limit?: number): string[] {
  return limit === undefined ? urls : urls.slice(0, limit);
}
