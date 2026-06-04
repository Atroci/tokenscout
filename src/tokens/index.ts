// Assemble a W3C DTCG-shaped design-token document from page extracts.
//
// Pure, zero runtime deps. Reuses the perceptual color clustering from
// src/color and the type/spacing scale reducers. Deterministic ordering:
// colors by cluster totalCount desc, sizes/spacing ascending.

import {
  clusterColors,
  parseColor,
  DEFAULT_DELTA_E,
  type ColorInput,
} from "../color/index.js";
import { reduceTypeScale } from "../type/index.js";
import { reduceSpacingScale } from "../spacing/index.js";
import type { PageExtract, DesignTokens, TokenGroup } from "../schema.js";

export interface AssembleOptions {
  /** ΔE76 clustering threshold for colors. Defaults to DEFAULT_DELTA_E. */
  deltaE?: number;
  /** Root font-size in px for rem→px conversion. Defaults to 16. */
  rootPx?: number;
}

/**
 * Reduce hand-built or extractor-produced PageExtract[] into a DTCG token
 * document: { color, fontSize, spacing }. Empty groups are omitted.
 */
export function assembleTokens(
  pages: PageExtract[],
  opts: AssembleOptions = {},
): DesignTokens {
  const { deltaE = DEFAULT_DELTA_E, rootPx } = opts;
  const tokens: DesignTokens = {};

  const color = buildColorGroup(pages, deltaE);
  if (color) tokens.color = color;

  const fontSize = buildFontSizeGroup(pages, rootPx);
  if (fontSize) tokens.fontSize = fontSize;

  const spacing = buildSpacingGroup(pages, rootPx);
  if (spacing) tokens.spacing = spacing;

  return tokens;
}

function buildColorGroup(
  pages: PageExtract[],
  deltaE: number,
): TokenGroup | null {
  const inputs: ColorInput[] = [];
  for (const page of pages) {
    for (const obs of page.colors) {
      const parsed = parseColor(obs.value);
      if (parsed) {
        inputs.push({ value: obs.value, rgb: parsed.rgb, count: obs.count });
      }
    }
  }
  if (inputs.length === 0) return null;

  const clusters = clusterColors(inputs, deltaE);
  const group: TokenGroup = {};
  clusters.forEach((cluster, i) => {
    group[`color-${i + 1}`] = {
      $value: cluster.canonical,
      $type: "color",
    };
  });
  return group;
}

function buildFontSizeGroup(
  pages: PageExtract[],
  rootPx?: number,
): TokenGroup | null {
  const scale = reduceTypeScale(pages, rootPx);
  if (scale.sizes.length === 0) return null;

  const group: TokenGroup = {};
  scale.sizes.forEach((size, i) => {
    group[`font-size-${i + 1}`] = {
      $value: { value: size, unit: "px" },
      $type: "dimension",
    };
  });
  return group;
}

function buildSpacingGroup(
  pages: PageExtract[],
  rootPx?: number,
): TokenGroup | null {
  const scale = reduceSpacingScale(pages, rootPx);
  if (scale.scale.length === 0) return null;

  const group: TokenGroup = {};
  scale.scale.forEach((step, i) => {
    group[`spacing-${i + 1}`] = {
      $value: { value: step, unit: "px" },
      $type: "dimension",
    };
  });
  return group;
}
