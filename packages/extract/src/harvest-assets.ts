// Image / asset harvesting (ROADMAP Phase 3). Collect candidate asset
// references from a rendered page, then resolve them into a clean manifest.
// The browser-side collector is self-contained (it runs inside the page, so it
// cannot reference anything from this module's scope). Resolution and dedupe
// live in buildAssetManifest() so they stay testable without a browser.

import type { Page } from "playwright";

/** Where an asset reference was found in the rendered DOM. */
export type AssetKind =
  | "image"
  | "background"
  | "favicon"
  | "og-image"
  | "video-poster";

/** One resolved asset: an absolute http(s) URL plus the first kind it was seen as. */
export interface AssetRef {
  url: string;
  kind: AssetKind;
  /** CSS position value of the img element or its nearest positioned ancestor ('static'|'absolute'|'fixed'|'relative'|'sticky'). */
  position?: string;
  /** Computed z-index string ('auto' or a number string). */
  zIndex?: string;
  /** Number of sibling <img> elements in the same parent container. */
  siblingImgCount?: number;
  /** CSS selector for the nearest ancestor with position !== 'static', if any. */
  positionedAncestorSelector?: string;
  /** True when position is 'absolute' or 'fixed': flags likely overlay. */
  isOverlay?: boolean;
}

/** The de-duplicated, sorted set of assets discovered on one page. */
export interface AssetManifest {
  assets: AssetRef[];
}

/** A raw, un-resolved reference as the browser-side collector reports it. */
interface RawAssetRef {
  /** Verbatim URL string (may be relative, protocol-relative, or a data: URI). */
  url: string;
  kind: string;
  position?: string;
  zIndex?: string;
  siblingImgCount?: number;
  positionedAncestorSelector?: string;
  isOverlay?: boolean;
}

/**
 * Runs in the browser. Walks the rendered DOM and gathers candidate asset
 * references: <img> src/srcset, <source> srcset, computed background-image
 * url(...), <video> poster, <link rel~="icon"> hrefs, and og:image meta.
 * Returns verbatim URL strings; resolution and dedupe happen in the pure
 * buildAssetManifest().
 */
function collectAssetRefs(): RawAssetRef[] {
  const refs: RawAssetRef[] = [];

  // Split a srcset attribute into its candidate URLs, dropping the descriptors
  // (the "2x" or "640w" part after each URL). Commas can appear inside data:
  // URIs, so split on whitespace-delimited descriptors rather than bare commas.
  const srcsetUrls = (srcset: string): string[] =>
    srcset
      .split(",")
      .map((candidate) => candidate.trim().split(/\s+/)[0])
      .filter((u) => u.length > 0);

  // background-image can carry several layers and may quote the URL.
  const backgroundUrls = (value: string): string[] => {
    const out: string[] = [];
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) out.push(m[2].trim());
    return out;
  };

  for (const img of Array.from(document.querySelectorAll("img"))) {
    // Collect composition-layering metadata for this img element.
    const computed = getComputedStyle(img);
    const position = computed.position;
    const zIndex = computed.zIndex;
    const siblingImgCount = img.parentElement
      ? img.parentElement.querySelectorAll("img").length - 1
      : 0;
    const isOverlay = position === "absolute" || position === "fixed";

    // Walk ancestors to find the nearest one with position !== 'static'.
    let positionedAncestorSelector: string | undefined;
    let ancestor = img.parentElement;
    while (ancestor && ancestor !== document.body) {
      if (getComputedStyle(ancestor).position !== "static") {
        const id = ancestor.id;
        const cls = ancestor.className;
        const qualifier = id
          ? "#" + id
          : cls && typeof cls === "string" && cls.trim()
            ? "." + cls.trim().split(/\s+/)[0]
            : "";
        positionedAncestorSelector = ancestor.tagName.toLowerCase() + qualifier;
        break;
      }
      ancestor = ancestor.parentElement;
    }

    const layering: Pick<
      RawAssetRef,
      | "position"
      | "zIndex"
      | "siblingImgCount"
      | "positionedAncestorSelector"
      | "isOverlay"
    > = {
      position,
      zIndex,
      siblingImgCount,
      isOverlay,
      ...(positionedAncestorSelector !== undefined
        ? { positionedAncestorSelector }
        : {}),
    };

    const src = img.getAttribute("src");
    if (src) refs.push({ url: src, kind: "image", ...layering });
    const srcset = img.getAttribute("srcset");
    if (srcset)
      for (const u of srcsetUrls(srcset))
        refs.push({ url: u, kind: "image", ...layering });
  }

  for (const source of Array.from(document.querySelectorAll("source"))) {
    const srcset = source.getAttribute("srcset");
    if (srcset)
      for (const u of srcsetUrls(srcset)) refs.push({ url: u, kind: "image" });
  }

  for (const el of Array.from(document.querySelectorAll("*"))) {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== "none")
      for (const u of backgroundUrls(bg))
        refs.push({ url: u, kind: "background" });
  }

  for (const video of Array.from(document.querySelectorAll("video"))) {
    const poster = video.getAttribute("poster");
    if (poster) refs.push({ url: poster, kind: "video-poster" });
  }

  // rel can be a space-separated token list, e.g. "shortcut icon".
  for (const link of Array.from(document.querySelectorAll("link[rel]"))) {
    const rel = (link.getAttribute("rel") || "").toLowerCase().split(/\s+/);
    const href = link.getAttribute("href");
    if (href && rel.includes("icon")) refs.push({ url: href, kind: "favicon" });
  }

  for (const meta of Array.from(
    document.querySelectorAll(
      'meta[property="og:image"], meta[name="og:image"]',
    ),
  )) {
    const content = meta.getAttribute("content");
    if (content) refs.push({ url: content, kind: "og-image" });
  }

  return refs;
}

/** True only for the asset kinds this module emits. Anything else is dropped. */
function isAssetKind(kind: string): kind is AssetKind {
  return (
    kind === "image" ||
    kind === "background" ||
    kind === "favicon" ||
    kind === "og-image" ||
    kind === "video-poster"
  );
}

/**
 * Resolve raw references into a clean manifest. Relative and protocol-relative
 * URLs resolve against pageUrl; data: URIs and anything that does not resolve
 * to an http(s) URL are dropped. The result is de-duplicated by resolved URL
 * (first kind seen wins) and sorted by url.
 */
export function buildAssetManifest(
  pageUrl: string,
  refs: RawAssetRef[],
): AssetManifest {
  const byUrl = new Map<string, AssetRef>();

  for (const ref of refs) {
    const { url, kind } = ref;
    if (!isAssetKind(kind)) continue;

    const raw = url.trim();
    // Cheap reject before URL parsing: data: (and blob:) carry no fetchable ref.
    if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) continue;

    let resolved: URL;
    try {
      resolved = new URL(raw, pageUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:")
      continue;

    // First kind seen for a given resolved URL wins.
    if (!byUrl.has(resolved.href)) {
      const entry: AssetRef = { url: resolved.href, kind };
      // Pass layering metadata through only for image refs.
      if (kind === "image") {
        if (ref.position !== undefined) entry.position = ref.position;
        if (ref.zIndex !== undefined) entry.zIndex = ref.zIndex;
        if (ref.siblingImgCount !== undefined)
          entry.siblingImgCount = ref.siblingImgCount;
        if (ref.positionedAncestorSelector !== undefined)
          entry.positionedAncestorSelector = ref.positionedAncestorSelector;
        if (ref.isOverlay !== undefined) entry.isOverlay = ref.isOverlay;
      }
      byUrl.set(resolved.href, entry);
    }
  }

  const assets = [...byUrl.values()].sort((a, b) =>
    a.url < b.url ? -1 : a.url > b.url ? 1 : 0,
  );

  return { assets };
}

/** Collect asset references from `page` and resolve them into a manifest. */
export async function discoverAssets(
  page: Page,
  pageUrl: string,
): Promise<AssetManifest> {
  const refs = await page.evaluate(collectAssetRefs);
  return buildAssetManifest(pageUrl, refs);
}
