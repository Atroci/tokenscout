// Type-scale reducer: turn observed font-size strings into a sorted, deduped
// px scale and (best-effort) the modular ratio that generated it.
//
// Truth over invention: sizes are reported exactly as observed (rounded to
// 2dp). The ratio is informational — a heuristic over the observed sizes, with
// a `consistency` score that says how strongly the sizes actually follow it.
// We never snap sizes to the detected ratio.

import { parseLength } from "../length.js";
import type { PageExtract } from "../schema.js";

export interface TypeScale {
  /** Observed font sizes in px, ascending, deduped, rounded to 2dp. */
  sizes: number[];
  /** Detected modular ratio (>1), rounded to 3dp, or null if none holds. */
  ratio: number | null;
  /** Fraction of consecutive size-pairs that agree with the detected ratio. */
  consistency: number;
  unit: "px";
}

/** Tolerance band around the candidate ratio for a pair to count as agreeing. */
const RATIO_TOLERANCE = 0.04;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Reduce every page's observed font sizes to one type scale.
 *
 * @param pages   Hand-built or extractor-produced page observations.
 * @param rootPx  Root font-size for rem→px conversion (default 16). The real
 *                extractor should pass the page's true html{font-size}.
 */
export function reduceTypeScale(
  pages: PageExtract[],
  rootPx: number = 16,
): TypeScale {
  const px: number[] = [];
  for (const page of pages) {
    for (const raw of page.type.sizes) {
      const v = parseLength(raw, rootPx);
      if (v !== null) px.push(v);
    }
  }

  const sizes = [...new Set(px.map((v) => Math.round(v * 100) / 100))].sort(
    (a, b) => a - b,
  );

  if (sizes.length < 2) {
    return { sizes, ratio: null, consistency: 0, unit: "px" };
  }

  const ratios: number[] = [];
  for (let i = 0; i < sizes.length - 1; i++) {
    ratios.push(sizes[i + 1] / sizes[i]);
  }

  const candidate = median(ratios);
  const agreeing = ratios.filter(
    (r) => Math.abs(r - candidate) <= RATIO_TOLERANCE,
  ).length;
  const consistency = agreeing / ratios.length;
  const required = Math.ceil(ratios.length / 2);

  const holds = candidate > 1 && agreeing >= required;
  return {
    sizes,
    ratio: holds ? Math.round(candidate * 1000) / 1000 : null,
    consistency,
    unit: "px",
  };
}
