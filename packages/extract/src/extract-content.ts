// Text content extraction (ROADMAP Gap-G). Collect visible text nodes, alt
// attributes, aria-labels, and placeholder values from a rendered page so the
// redesign-brief private pipeline has real copy to work with.
// Same structure as harvest-assets.ts: self-contained browser collector +
// pure builder + Playwright wrapper.

import type { Page } from "playwright";

/** Text found in a specific element context. */
export interface TextNode {
  /** CSS selector path that identifies this element (tag + first class + nth). */
  selector: string;
  /** Trimmed text content, max 500 chars. */
  text: string;
}

/** All content extracted from a page or section. */
export interface PageContent {
  /** Visible text nodes (non-empty, de-duplicated). */
  texts: TextNode[];
  /** <img> alt attributes that are non-empty. */
  alts: string[];
  /** aria-label values from interactive elements. */
  ariaLabels: string[];
  /** <input>/<textarea> placeholder values. */
  placeholders: string[];
}

export interface ExtractContentOptions {
  /** Limit extraction to descendants of this selector. Defaults to 'body'. */
  rootSelector?: string;
  /** Max number of text nodes to collect. Defaults to 200. */
  maxTexts?: number;
}

/**
 * Runs in the browser. Walks every descendant of rootSelector and collects:
 * - Elements that have exactly one direct text-node child with non-empty content.
 * - <img> alt attributes.
 * - [aria-label] attribute values (de-duplicated).
 * - <input>/<textarea> placeholder values.
 *
 * Accepts a single serialisable arg so page.evaluate() can pass it across
 * the Node↔browser boundary. Returns a plain object for the same reason.
 */
function collectContent({
  rootSelector,
  maxTexts,
}: {
  rootSelector: string;
  maxTexts: number;
}): {
  texts: Array<{ selector: string; text: string }>;
  alts: string[];
  ariaLabels: string[];
  placeholders: string[];
} {
  const root = document.querySelector(rootSelector) ?? document.body;

  const texts: Array<{ selector: string; text: string }> = [];

  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (texts.length >= maxTexts) break;

    // We want elements that have exactly one direct child that is a non-empty
    // text node. Elements with multiple children (mixed content) are skipped so
    // we don't accidentally capture partial or concatenated copy.
    const children = Array.from(el.childNodes);
    const textChildren = children.filter(
      (n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0,
    );
    const nonTextChildren = children.filter(
      (n) => n.nodeType !== 3 && n.nodeType !== 8, // exclude comments too
    );

    if (textChildren.length !== 1 || nonTextChildren.length !== 0) continue;

    const rawText = (textChildren[0].textContent ?? "").trim();
    if (rawText.length === 0) continue;

    // Build a simple selector: tag + optional first class + nth-of-type.
    const tag = el.tagName.toLowerCase();
    const firstClass =
      el.className && typeof el.className === "string"
        ? el.className.trim().split(/\s+/)[0]
        : "";
    const classStr = firstClass ? "." + firstClass : "";

    // Compute 1-based nth-of-type among siblings.
    let nth = 1;
    if (el.parentElement) {
      for (const sibling of Array.from(el.parentElement.children)) {
        if (sibling === el) break;
        if (sibling.tagName === el.tagName) nth++;
      }
    }

    const selector = `${tag}${classStr}:nth-of-type(${nth})`;
    texts.push({ selector, text: rawText.slice(0, 500) });
  }

  // alt attributes from <img> elements.
  const alts: string[] = [];
  for (const img of Array.from(root.querySelectorAll("img[alt]"))) {
    const alt = img.getAttribute("alt") ?? "";
    if (alt.trim().length > 0) alts.push(alt);
  }

  // aria-label values, de-duplicated.
  const seenAriaLabels = new Set<string>();
  const ariaLabels: string[] = [];
  for (const el of Array.from(root.querySelectorAll("[aria-label]"))) {
    const label = (el.getAttribute("aria-label") ?? "").trim();
    if (label.length > 0 && !seenAriaLabels.has(label)) {
      seenAriaLabels.add(label);
      ariaLabels.push(label);
    }
  }

  // placeholder attributes.
  const placeholders: string[] = [];
  for (const el of Array.from(
    root.querySelectorAll("input[placeholder], textarea[placeholder]"),
  )) {
    const ph = (el.getAttribute("placeholder") ?? "").trim();
    if (ph.length > 0) placeholders.push(ph);
  }

  return { texts, alts, ariaLabels, placeholders };
}

/** Collect text content from `page` and return a structured PageContent. */
export async function extractContent(
  page: Page,
  options: ExtractContentOptions = {},
): Promise<PageContent> {
  const { rootSelector = "body", maxTexts = 200 } = options;
  const raw = await page.evaluate(collectContent, { rootSelector, maxTexts });
  return raw as PageContent;
}
