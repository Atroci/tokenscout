// SVG icon extraction (Gap-E). Collect all inline <svg> elements from a rendered
// page, deduplicate them by content hash, and return a manifest. The browser-side
// collector is self-contained (runs inside page.evaluate, no outer scope refs).
// Normalisation, hashing, and manifest assembly live in pure functions so they
// are testable without a browser.

import type { Page } from "playwright";

/** A raw SVG reference collected from the DOM before deduplication. */
export interface RawSvgRef {
  /** Outer HTML of the <svg> element, trimmed. */
  html: string;
  /** viewBox attribute, if present. */
  viewBox: string | null;
  /** width/height as reported by getBoundingClientRect (may be 0 for hidden svgs). */
  width: number;
  height: number;
  /** aria-label or title child text, if any — hints at a semantic name. */
  label: string | null;
  /** True when the svg is inside an <a> or <button> — likely an interactive icon. */
  isInteractive: boolean;
}

/** One deduplicated SVG icon in the manifest. */
export interface SvgIcon {
  /** Stable content hash derived from normalised SVG markup (base36, 8 chars). */
  hash: string;
  /** Normalised SVG markup (IDs and classes stripped to reduce noise). */
  svg: string;
  viewBox: string | null;
  width: number;
  height: number;
  /** Best available semantic label. */
  label: string | null;
  isInteractive: boolean;
  /** How many times this icon appeared on the page. */
  count: number;
}

/** The de-duplicated, sorted set of SVG icons discovered on one page. */
export interface SvgIconManifest {
  icons: SvgIcon[];
}

/**
 * Runs in the browser. Walks the rendered DOM and gathers all inline <svg>
 * elements: outer HTML, viewBox, bounding rect, semantic label, and whether
 * the SVG is inside an interactive element.
 * Self-contained — references no outer module scope.
 */
function collectSvgRefs(): RawSvgRef[] {
  const refs: RawSvgRef[] = [];

  for (const svg of Array.from(document.querySelectorAll("svg"))) {
    const html = (svg.outerHTML ?? "").trim();
    if (!html) continue;

    const viewBox = svg.getAttribute("viewBox");
    const rect = svg.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Prefer aria-label; fall back to first <title> child text.
    const ariaLabel = svg.getAttribute("aria-label");
    const titleEl = svg.querySelector("title");
    const label =
      ariaLabel
        ? ariaLabel.trim() || null
        : titleEl && titleEl.textContent
        ? titleEl.textContent.trim() || null
        : null;

    const isInteractive = svg.closest("a, button") !== null;

    refs.push({ html, viewBox, width, height, label, isInteractive });
  }

  return refs;
}

/**
 * Normalise SVG markup so that per-instance variation (unique IDs, class names)
 * does not break deduplication. Pure — no browser dependency.
 */
export function normaliseSvg(html: string): string {
  return html
    .replace(/\s+id="[^"]*"/g, "")
    .replace(/\s+id='[^']*'/g, "")
    .replace(/\s+class="[^"]*"/g, "")
    .replace(/\s+class='[^']*'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * djb2 hash of a string → unsigned 32-bit integer → base36 string, left-padded
 * to 8 characters. Pure — no crypto dependency.
 */
export function hashSvg(normalised: string): string {
  let hash = 5381;
  for (let i = 0; i < normalised.length; i++) {
    // djb2: hash = hash * 33 ^ char
    hash = ((hash << 5) + hash) ^ normalised.charCodeAt(i);
  }
  // Convert to unsigned 32-bit and then base36.
  const unsigned = hash >>> 0;
  return unsigned.toString(36).padStart(8, "0");
}

/**
 * Deduplicate raw refs by normalised content hash, count occurrences, and sort
 * by count descending then hash ascending. Pure — testable without a browser.
 */
export function buildIconManifest(refs: RawSvgRef[]): SvgIconManifest {
  interface Entry {
    hash: string;
    svg: string;
    viewBox: string | null;
    width: number;
    height: number;
    label: string | null;
    isInteractive: boolean;
    count: number;
  }

  const byHash = new Map<string, Entry>();

  for (const ref of refs) {
    const svg = normaliseSvg(ref.html);
    const hash = hashSvg(svg);

    const existing = byHash.get(hash);
    if (existing) {
      existing.count += 1;
    } else {
      byHash.set(hash, {
        hash,
        svg,
        viewBox: ref.viewBox,
        width: ref.width,
        height: ref.height,
        label: ref.label,
        isInteractive: ref.isInteractive,
        count: 1,
      });
    }
  }

  const icons = [...byHash.values()].sort((a, b) => {
    // Primary: count descending.
    if (b.count !== a.count) return b.count - a.count;
    // Secondary: hash ascending (stable tie-break).
    return a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0;
  });

  return { icons };
}

/** Collect inline SVGs from `page` and return a deduplicated icon manifest. */
export async function extractSVGIcons(page: Page): Promise<SvgIconManifest> {
  const refs = await page.evaluate(collectSvgRefs);
  return buildIconManifest(refs);
}
