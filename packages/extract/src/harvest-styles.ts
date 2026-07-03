// Per-element CSS harvest (Gap-A keystone). Walks the rendered DOM via
// getComputedStyle(), depth-limited, and collects a style tree of non-default
// non-zero property values. Mirrors the ai-website-cloner-template approach.
// The browser-side collector is self-contained (no closure references to outer
// module scope). Pure builder helpers are tested without a browser.

import type { Page } from "playwright";

/** A map of CSS property name → computed value (noise-filtered). */
export type StyleProps = Record<string, string>;

/** One element in the harvested style tree. */
export interface StyleNode {
  tag: string;
  /** First 5 class names, space-separated. */
  classes: string;
  /** Text content when element has exactly one text-node child, trimmed, max 200 chars. Null otherwise. */
  text: string | null;
  /** Non-default, non-zero computed style values from STYLE_PROPS. */
  styles: StyleProps;
  /** img src if tag is 'img', null otherwise. */
  imgSrc: string | null;
  childCount: number;
  children: StyleNode[];
}

/** Options for harvestStyles(). */
export interface HarvestStylesOptions {
  /** CSS selector of the root element to walk. Defaults to 'body'. */
  selector?: string;
  /** Max depth to recurse. Defaults to 4. */
  depth?: number;
  /** Max children to visit per node. Defaults to 20. */
  maxChildren?: number;
}

// Noise values that carry no design signal. Must match the filter in
// filterStyles() (duplicated there for test coverage without a browser).
const NOISE = new Set([
  "none",
  "normal",
  "auto",
  "0px",
  "rgba(0, 0, 0, 0)",
  "",
]);

/**
 * Filter a raw computed-style map, dropping noise values.
 * Exported for unit testing — mirrors the logic baked into collectStyleTree.
 */
export function filterStyles(raw: Record<string, string>): StyleProps {
  const out: StyleProps = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!NOISE.has(v)) out[k] = v;
  }
  return out;
}

/**
 * Extract the single-text-node text for an element.
 * Returns null if the element has zero or more than one child node, or if that
 * child is not a text node. Exported for unit testing.
 */
export function extractText(
  childCount: number,
  isTextNode: boolean,
  rawText: string,
): string | null {
  if (childCount !== 1 || !isTextNode) return null;
  const trimmed = rawText.trim();
  return trimmed.slice(0, 200) || null;
}

/**
 * Browser-side style-tree collector. Fully self-contained — no references to
 * outer module scope — because it runs inside page.evaluate().
 *
 * Accepts a single tuple arg [selector, depth, maxChildren] to match the
 * Playwright page.evaluate(fn, arg) overload.
 *
 * Returns null when the selector is not found.
 */
function collectStyleTree([
  selector,
  depth,
  maxChildren,
]: [string, number, number]): StyleNode | null {
  // Noise values inlined — must stay identical to the outer NOISE constant.
  const NOISE_VALS = new Set([
    "none",
    "normal",
    "auto",
    "0px",
    "rgba(0, 0, 0, 0)",
    "",
  ]);

  const PROPS = [
    "fontSize",
    "fontWeight",
    "fontFamily",
    "lineHeight",
    "letterSpacing",
    "color",
    "textTransform",
    "textDecoration",
    "backgroundColor",
    "background",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "width",
    "height",
    "maxWidth",
    "minWidth",
    "maxHeight",
    "minHeight",
    "display",
    "flexDirection",
    "justifyContent",
    "alignItems",
    "gap",
    "gridTemplateColumns",
    "gridTemplateRows",
    "borderRadius",
    "border",
    "borderTop",
    "borderBottom",
    "borderLeft",
    "borderRight",
    "boxShadow",
    "overflow",
    "overflowX",
    "overflowY",
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "zIndex",
    "opacity",
    "transform",
    "transition",
    "cursor",
    "objectFit",
    "objectPosition",
    "mixBlendMode",
    "filter",
    "backdropFilter",
    "whiteSpace",
    "textOverflow",
  ] as const;

  function walk(el: Element, remaining: number): StyleNode {
    const tag = el.tagName.toLowerCase();

    // First 5 class names, space-joined.
    const classes = Array.from(el.classList).slice(0, 5).join(" ");

    // Computed styles — drop noise values.
    const computed = getComputedStyle(el);
    const styles: Record<string, string> = {};
    for (const prop of PROPS) {
      const val = computed.getPropertyValue
        ? computed.getPropertyValue(
            prop.replace(/([A-Z])/g, (c) => "-" + c.toLowerCase()),
          )
        : (computed as unknown as Record<string, string>)[prop] ?? "";
      const trimmed = val.trim();
      if (!NOISE_VALS.has(trimmed)) styles[prop] = trimmed;
    }

    // Single-text-node text.
    const childNodes = Array.from(el.childNodes);
    let text: string | null = null;
    if (childNodes.length === 1 && childNodes[0].nodeType === Node.TEXT_NODE) {
      const raw = (childNodes[0].textContent ?? "").trim();
      text = raw ? raw.slice(0, 200) : null;
    }

    const imgSrc =
      tag === "img" ? (el as HTMLImageElement).getAttribute("src") : null;

    const elementChildren = Array.from(el.children).slice(0, maxChildren);
    const childCount = el.children.length;

    const children: StyleNode[] =
      remaining > 0
        ? elementChildren.map((child) => walk(child, remaining - 1))
        : [];

    return { tag, classes, text, styles, imgSrc, childCount, children };
  }

  const root = document.querySelector(selector);
  if (!root) return null;
  return walk(root, depth);
}

/**
 * Harvest a per-element CSS style tree from `page`.
 * Returns null when the root selector is not found in the page.
 */
export async function harvestStyles(
  page: Page,
  options: HarvestStylesOptions = {},
): Promise<StyleNode | null> {
  const { selector = "body", depth = 4, maxChildren = 20 } = options;
  const args: [string, number, number] = [selector, depth, maxChildren];
  return page.evaluate(collectStyleTree, args);
}
