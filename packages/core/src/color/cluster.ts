// Perceptual color clustering: count-ordered nearest-leader over ΔE2000.
//
// Groups near-duplicate colors that are syntactically distinct but
// perceptually identical (e.g. #3a7bd5, #3b7cd6, rgb(58,123,213)). The
// canonical per cluster is the highest-count member.
//
// Colors are visited by count descending; each joins the nearest existing
// leader within `threshold` of that leader's Lab, or founds a new cluster.
// Every member is therefore within `threshold` of its canonical — the
// unbounded transitive chaining of the earlier single-linkage pass cannot
// happen. Order-dependence is the deliberate trade: high-count colors anchor
// clusters, tails attach to them.

import { rgbToLab, deltaE2000, roundLab, type Lab, type Rgb } from "./lab.js";

/**
 * ΔE2000 just-noticeable-difference threshold.
 * PLAN names ΔE2000 ≤ 2; deltas below ~2 are imperceptible to most observers.
 */
export const DEFAULT_DELTA_E = 2.0;

export interface ColorInput {
  /** Original CSS string, kept verbatim for reporting. */
  value: string;
  /** sRGB channels in 0..1. */
  rgb: Rgb;
  /** Occurrence weight; the highest-count member becomes canonical. */
  count?: number;
  /** CSS property this color was painted from, e.g. "color", "background-color". */
  role?: string;
  /** Page (URL) the observation came from; feeds the cluster's pageCount. */
  page?: string;
}

export interface Cluster {
  /** Highest-count member's original value. */
  canonical: string;
  /** Sorted unique member values in this cluster. */
  members: string[];
  /** Summed count across all members. */
  totalCount: number;
  /**
   * Distinct pages (ColorInput.page) the cluster was observed on. Breadth
   * signal: separates site-wide chrome (high) from one-page accents (1).
   * 0 when no input carried page info.
   */
  pageCount: number;
  /** Sorted, de-duplicated CSS properties (roles) across the cluster's members. */
  cssProperties: string[];
  /** Lab of the canonical member, rounded to 2dp. */
  lab: Lab;
  /** sRGB of the canonical member (0..1 channels). */
  rgb: Rgb;
}

/**
 * Cluster colors by perceptual similarity (ΔE2000). Result is sorted by
 * totalCount descending. O(n·k) for k clusters, fine for the tens-to-low-
 * hundreds of distinct colors a real stylesheet yields.
 */
export function clusterColors(
  colors: ColorInput[],
  threshold: number = DEFAULT_DELTA_E,
): Cluster[] {
  // Count desc, then value asc: deterministic leaders regardless of input order.
  const ordered = colors
    .map((c) => ({ input: c, lab: rgbToLab(c.rgb) }))
    .sort(
      (a, b) =>
        (b.input.count ?? 0) - (a.input.count ?? 0) ||
        (a.input.value < b.input.value ? -1 : a.input.value > b.input.value ? 1 : 0),
    );

  const groups: { lab: Lab; members: ColorInput[] }[] = [];
  for (const { input, lab } of ordered) {
    let best: (typeof groups)[number] | undefined;
    let bestD = Infinity;
    for (const g of groups) {
      const d = deltaE2000(lab, g.lab);
      if (d <= threshold && d < bestD) {
        best = g;
        bestD = d;
      }
    }
    if (best) best.members.push(input);
    else groups.push({ lab, members: [input] });
  }

  const clusters: Cluster[] = groups.map(({ members }) => {
    // First member is the leader: highest count, and the anchor `threshold`
    // was measured against.
    const canonical = members[0];
    return {
      canonical: canonical.value,
      members: [...new Set(members.map((m) => m.value))].sort(),
      totalCount: members.reduce((s, m) => s + (m.count ?? 0), 0),
      pageCount: new Set(
        members.map((m) => m.page).filter((p): p is string => p !== undefined),
      ).size,
      cssProperties: [
        ...new Set(
          members
            .map((m) => m.role)
            .filter((r): r is string => r !== undefined),
        ),
      ].sort(),
      lab: roundLab(rgbToLab(canonical.rgb)),
      rgb: canonical.rgb,
    };
  });

  clusters.sort((a, b) => b.totalCount - a.totalCount);
  return clusters;
}
