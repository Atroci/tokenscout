// Perceptual color clustering: single-linkage union-find over ΔE76.
//
// Groups near-duplicate colors that are syntactically distinct but
// perceptually identical (e.g. #3a7bd5, #3b7cd6, rgb(58,123,213)). The
// canonical per cluster is the highest-count member.
//
// Caveat: single-linkage chains transitively. If A~B and B~C are each within
// the threshold, A, B and C land in one cluster even when ΔE76(A, C) exceeds
// it. For near-continuous gradients a cluster's perceptual spread is therefore
// not bounded by `threshold`. Use a smaller threshold if that matters.

import { rgbToLab, deltaE76, roundLab, type Lab, type Rgb } from "./lab.js";

/**
 * ΔE76 just-noticeable-difference threshold for sRGB content.
 * PLAN names ΔE2000 ≤ 2; ΔE76 ≤ 2.5 is the rough sRGB equivalent (CIE TR 116).
 */
export const DEFAULT_DELTA_E = 2.5;

export interface ColorInput {
  /** Original CSS string, kept verbatim for reporting. */
  value: string;
  /** sRGB channels in 0..1. */
  rgb: Rgb;
  /** Occurrence weight; the highest-count member becomes canonical. */
  count?: number;
  /** CSS property this color was painted from, e.g. "color", "background-color". */
  role?: string;
}

export interface Cluster {
  /** Highest-count member's original value. */
  canonical: string;
  /** Sorted unique member values in this cluster. */
  members: string[];
  /** Summed count across all members. */
  totalCount: number;
  /** Sorted, de-duplicated CSS properties (roles) across the cluster's members. */
  cssProperties: string[];
  /** Lab of the canonical member, rounded to 2dp. */
  lab: Lab;
}

class UnionFind {
  private parent: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }

  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }

  union(x: number, y: number): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx !== ry) this.parent[rx] = ry;
  }
}

/**
 * Cluster colors by perceptual similarity. Result is sorted by totalCount
 * descending. O(n²) pairwise, which is fine for the tens-to-low-hundreds of
 * distinct colors a real stylesheet yields.
 */
export function clusterColors(
  colors: ColorInput[],
  threshold: number = DEFAULT_DELTA_E,
): Cluster[] {
  const n = colors.length;
  const labs: Lab[] = colors.map((c) => rgbToLab(c.rgb));
  const uf = new UnionFind(n);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (deltaE76(labs[i], labs[j]) <= threshold) uf.union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    const group = groups.get(root);
    if (group) group.push(i);
    else groups.set(root, [i]);
  }

  const clusters: Cluster[] = [];
  for (const idx of groups.values()) {
    const members = idx.map((i) => colors[i]);
    const canonical = members.reduce((a, b) =>
      (b.count ?? 0) > (a.count ?? 0) ? b : a,
    );
    clusters.push({
      canonical: canonical.value,
      members: [...new Set(members.map((m) => m.value))].sort(),
      totalCount: members.reduce((s, m) => s + (m.count ?? 0), 0),
      cssProperties: [
        ...new Set(
          members
            .map((m) => m.role)
            .filter((r): r is string => r !== undefined),
        ),
      ].sort(),
      lab: roundLab(rgbToLab(canonical.rgb)),
    });
  }

  clusters.sort((a, b) => b.totalCount - a.totalCount);
  return clusters;
}
