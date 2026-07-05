// WCAG 2.x relative luminance and contrast ratio. Pure TypeScript, zero deps.
//
// Deliberately separate from lab.ts's sRGB->linear step: WCAG's own formula
// linearizes with an 0.03928 threshold, not the precise sRGB EOTF's 0.04045
// (a long-standing, spec-preserved discrepancy). Using WCAG's exact formula
// here is what makes the ratio agree with checkers like WebAIM's.

import type { Rgb } from "./lab.js";

function linearize(c: number): number {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0..1) for an sRGB triple (0..1 channels). */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio (1..21) between two sRGB colors, order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export type WcagVerdict = "pass" | "fail";

/** WCAG 2.2 SC 1.4.3 minimum-contrast verdicts: normal text needs 4.5:1, large text 3:1. */
export function wcagVerdict(ratio: number): { normalText: WcagVerdict; largeText: WcagVerdict } {
  return {
    normalText: ratio >= 4.5 ? "pass" : "fail",
    largeText: ratio >= 3 ? "pass" : "fail",
  };
}
