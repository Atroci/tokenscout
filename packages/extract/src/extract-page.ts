// Collect computed-style observations from one page at one viewport width.
// The browser-side collector is a self-contained function (it runs inside the
// page, so it cannot reference anything from this module's scope). Aggregation
// is delegated to harvest() so it stays testable without a browser.

import type { Page } from "playwright";
import type { PageExtract } from "tokenscout/schema";
import { harvest, type RawObservations } from "./harvest.js";
import { scrollAndSettle } from "./capture.js";
import { assertPublicHttpUrl } from "./url-safety.js";

/** Runs in the browser. Walks the rendered DOM and reads computed styles. */
function collectObservations(): RawObservations {
  const colors: { value: string; role: string }[] = [];
  const fontSizes = new Set<string>();
  const fontFamilies = new Set<string>();
  const fontWeights = new Set<string>();
  const lineHeights = new Set<string>();
  const spacing = new Set<string>();

  const isPaint = (v: string): boolean =>
    !!v && v !== "rgba(0, 0, 0, 0)" && v !== "transparent" && v !== "none";

  for (const el of Array.from(document.querySelectorAll("*"))) {
    const cs = getComputedStyle(el);

    if (isPaint(cs.color)) colors.push({ value: cs.color, role: "color" });
    if (isPaint(cs.backgroundColor))
      colors.push({ value: cs.backgroundColor, role: "background-color" });
    if (parseFloat(cs.borderTopWidth) > 0 && isPaint(cs.borderTopColor))
      colors.push({ value: cs.borderTopColor, role: "border-color" });

    if (cs.fontSize) fontSizes.add(cs.fontSize);
    if (cs.fontFamily) fontFamilies.add(cs.fontFamily);
    if (cs.fontWeight) fontWeights.add(cs.fontWeight);
    if (cs.lineHeight && cs.lineHeight !== "normal")
      lineHeights.add(cs.lineHeight);

    for (const prop of [
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "row-gap",
      "column-gap",
    ]) {
      const v = cs.getPropertyValue(prop);
      if (v && v !== "0px" && v !== "normal") spacing.add(v);
    }
  }

  return {
    colors,
    fontSizes: [...fontSizes],
    fontFamilies: [...fontFamilies],
    fontWeights: [...fontWeights],
    lineHeights: [...lineHeights],
    spacing: [...spacing],
  };
}

/** Load `url` at `breakpoint` px wide and reduce its computed styles to a PageExtract. */
export async function extractPage(
  page: Page,
  url: string,
  breakpoint: number,
): Promise<PageExtract> {
  await assertPublicHttpUrl(url);
  await page.setViewportSize({ width: breakpoint, height: 900 });
  await page.goto(url, { waitUntil: "load" });
  // Reveal-on-scroll / lazy hero and carousel content stays unrendered (or
  // opacity:0) until scrolled into view — a snapshot right after load misses
  // its computed styles entirely. Scroll through and settle first.
  await scrollAndSettle(page, 800);
  const raw = await page.evaluate(collectObservations);
  return harvest(url, breakpoint, raw);
}
