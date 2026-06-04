// Spacing-scale reducer: collapse observed margin/padding/gap lengths into a
// grid. Detects the base unit (largest integer step every value is a multiple
// of), quantizes to it, then reports the sorted unique multiples. Pure,
// zero runtime deps.

import { DEFAULT_ROOT_PX, parseLength } from "../length.js";
import type { PageExtract } from "../schema.js";

export interface SpacingScale {
  /** Base grid unit in px (largest step every observed value snaps to). */
  base: number;
  /** Sorted unique spacing values in px, each a multiple of `base`. */
  scale: number[];
  unit: "px";
  /** Fraction of input values that were already exact multiples of `base`. */
  coverage: number;
}

/** Greatest common divisor of two non-negative integers. */
function gcd(a: number, b: number): number {
  // Guard: a non-finite operand makes `a % b` NaN and `while (b !== 0)` loop
  // forever. parseLength already rejects non-finite lengths; this is belt and
  // braces.
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * Reduce every page's spacing observations to a base grid + quantized scale.
 * rem values are converted with rootPx (default 16). Non-length and
 * non-positive values are dropped.
 */
export function reduceSpacingScale(
  pages: PageExtract[],
  rootPx: number = DEFAULT_ROOT_PX,
): SpacingScale {
  const pxValues: number[] = [];
  for (const page of pages) {
    for (const value of page.spacing.values) {
      const px = parseLength(value, rootPx);
      if (px === null) continue;
      const rounded = Math.round(px);
      if (rounded > 0) pxValues.push(rounded);
    }
  }

  if (pxValues.length === 0) {
    return { base: 1, scale: [], unit: "px", coverage: 0 };
  }

  const base = Math.max(
    1,
    pxValues.reduce((acc, v) => gcd(acc, v)),
  );

  const aligned = pxValues.filter((v) => v % base === 0).length;
  const coverage = aligned / pxValues.length;

  const quantized = pxValues.map((v) => Math.round(v / base) * base);
  const scale = [...new Set(quantized)].sort((a, b) => a - b);

  return { base, scale, unit: "px", coverage };
}
