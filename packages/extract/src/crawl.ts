// Same-origin link discovery. Minimal by design: load the entry page, collect
// its same-origin links, and return up to `top` URLs (entry first). Deeper
// crawling (sitemap.xml, recursion, ranking) is a later increment.

import type { Browser } from "playwright";
import { assertPublicHttpUrl } from "./url-safety.js";

/** Discover up to `top` same-origin pages, starting from `entry`. */
export async function discoverPages(
  browser: Browser,
  entry: string,
  top: number,
): Promise<string[]> {
  if (top <= 1) return [entry];

  await assertPublicHttpUrl(entry);
  const page = await browser.newPage();
  try {
    await page.goto(entry, { waitUntil: "load" });
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]")).map(
        (a) => (a as HTMLAnchorElement).href,
      ),
    );

    const origin = new URL(entry).origin;
    const sameOrigin = hrefs.filter((h) => {
      try {
        return new URL(h).origin === origin;
      } catch {
        return false;
      }
    });

    // Entry first, then unique same-origin links, capped at `top`.
    return [...new Set([entry, ...sameOrigin])].slice(0, top);
  } finally {
    await page.close();
  }
}
