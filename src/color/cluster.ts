// Perceptual color clustering: single-linkage union-find over ΔE76.
//
// Groups near-duplicate colors that are syntactically distinct but
// perceptually identical (e.g. #3a7bd5, #3b7cd6, rgb(58,123,213)). The
// canonical per cluster is the highest-count member.

import { rgbToLab, deltaE76, type Lab, type Rgb } from "./lab.js";

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
}

export interface Cluster {
  /** Highest-count member's original value. */
  canonical: string;
  /** Sorted unique member values in this cluster. */
  members: string[];
  /** Summed count across all members. */
  totalCount: number;
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
 * descending. O(n²) pairwise — fine for the tens-to-low-hundreds of distinct
 * colors a real stylesheet yields.
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
    const lab = rgbToLab(canonical.rgb);
    clusters.push({
      canonical: canonical.value,
      members: [...new Set(members.map((m) => m.value))].sort(),
      totalCount: members.reduce((s, m) => s + (m.count ?? 0), 0),
      lab: lab.map((v) => Math.round(v * 100) / 100) as unknown as Lab,
    });
  }

  clusters.sort((a, b) => b.totalCount - a.totalCount);
  return clusters;
}
