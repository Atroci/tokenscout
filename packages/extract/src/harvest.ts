// Pure aggregation: turn the raw style records collected from a rendered page
// into one PageExtract. No browser, no Playwright. This is where the testable
// logic lives; extract-page.ts only collects the raw records.

import type { ColorObservation, PageExtract } from "tokenscout/schema";

/** Raw, un-aggregated observations collected from one rendered page. */
export interface RawObservations {
  /** One entry per painted occurrence, so colors keep an occurrence weight. */
  colors: { value: string; role: string }[];
  /** De-duplicated font-size strings as the browser reported them. */
  fontSizes: string[];
  /** De-duplicated margin/padding/gap strings. */
  spacing: string[];
}

/**
 * Aggregate raw observations into a PageExtract. Colors are counted by
 * (value, role) so the core's clustering can weight a canonical by frequency;
 * font sizes and spacing pass through (the core reducers dedupe them).
 */
export function harvest(
  url: string,
  breakpoint: number,
  raw: RawObservations,
): PageExtract {
  const byKey = new Map<string, ColorObservation>();
  for (const { value, role } of raw.colors) {
    const key = `${role}|${value}`;
    const existing = byKey.get(key);
    if (existing) existing.count += 1;
    else byKey.set(key, { value, role, count: 1 });
  }

  return {
    url,
    breakpoint,
    colors: [...byKey.values()],
    type: { sizes: raw.fontSizes },
    spacing: { values: raw.spacing },
  };
}
