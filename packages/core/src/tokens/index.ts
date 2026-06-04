// Assemble a W3C DTCG-shaped design-token document from page extracts.
//
// Pure, zero runtime deps. Reuses the perceptual color clustering from
// src/color and the type/spacing scale reducers. Deterministic ordering:
// colors by cluster totalCount desc, sizes/spacing ascending.

import {
  clusterColors,
  parseColor,
  nearestNamedColor,
  DEFAULT_DELTA_E,
  type ColorInput,
} from "../color/index.js";
import { stableColorId } from "../color/id.js";
import { reduceTypeScale } from "../type/index.js";
import { reduceSpacingScale } from "../spacing/index.js";
import type {
  PageExtract,
  DesignTokens,
  TokenGroup,
  AnimationInput,
} from "../schema.js";

export interface AssembleOptions {
  /** ΔE76 clustering threshold for colors. Defaults to DEFAULT_DELTA_E. */
  deltaE?: number;
  /** Root font-size in px for rem→px conversion. Defaults to 16. */
  rootPx?: number;
  /** Motion observations (durations in ms). Emitted as a DTCG `duration` group. */
  animations?: AnimationInput;
}

/**
 * Reduce hand-built or extractor-produced PageExtract[] into a DTCG token
 * document: { color, fontSize, spacing, duration }. Empty groups are omitted.
 */
export function assembleTokens(
  pages: PageExtract[],
  opts: AssembleOptions = {},
): DesignTokens {
  const { deltaE = DEFAULT_DELTA_E, rootPx, animations } = opts;
  const tokens: DesignTokens = {};

  const color = buildColorGroup(pages, deltaE);
  if (color) tokens.color = color;

  const fontSize = buildFontSizeGroup(pages, rootPx);
  if (fontSize) tokens.fontSize = fontSize;

  const spacing = buildSpacingGroup(pages, rootPx);
  if (spacing) tokens.spacing = spacing;

  const duration = buildDurationGroup(animations);
  if (duration) tokens.duration = duration;

  return tokens;
}

/** Emit ascending, de-duplicated DTCG `duration` tokens (ms) from motion input. */
function buildDurationGroup(
  animations: AnimationInput | undefined,
): TokenGroup | null {
  const ms = animations?.durations ?? [];
  const sorted = [
    ...new Set(ms.filter((d) => Number.isFinite(d) && d > 0)),
  ].sort((a, b) => a - b);
  if (sorted.length === 0) return null;

  const group: TokenGroup = {};
  sorted.forEach((value, i) => {
    group[`duration-${i + 1}`] = {
      $value: { value, unit: "ms" },
      $type: "duration",
    };
  });
  return group;
}

function buildColorGroup(
  pages: PageExtract[],
  deltaE: number,
): TokenGroup | null {
  const inputs: ColorInput[] = [];
  // Sprawl audit: count DISTINCT authored color strings we could vs. could not
  // turn into tokens. Honest about tokenscout's OWN parser coverage (hex / rgb /
  // hsl / named), not colorjs.io's — a color we now parse is no longer a "drop".
  const analyzableValues = new Set<string>();
  const unanalyzableValues = new Set<string>();
  for (const page of pages) {
    for (const obs of page.colors) {
      const parsed = parseColor(obs.value);
      // Drop fully transparent paints: alpha 0 is never a brand token, and
      // since clustering ignores alpha, a high-count transparent value could
      // otherwise win as a cluster's canonical color.
      if (parsed && parsed.alpha > 0) {
        analyzableValues.add(obs.value);
        inputs.push({
          value: obs.value,
          rgb: parsed.rgb,
          count: obs.count,
          role: obs.role,
        });
      } else {
        unanalyzableValues.add(obs.value);
      }
    }
  }
  if (inputs.length === 0) return null;

  const clusters = clusterColors(inputs, deltaE);
  const group: TokenGroup = {};
  for (const cluster of clusters) {
    // Canonical came from a parsed input, so it always re-parses; the
    // non-null assertion documents that invariant.
    const parsed = parseColor(cluster.canonical)!;
    const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
    const [r, g, b] = parsed.rgb;
    const key = stableColorId(cluster.canonical, nearestNamedColor(parsed.rgb));
    group[key] = {
      $value: {
        colorSpace: "srgb",
        components: [round5(r), round5(g), round5(b)],
        alpha: parsed.alpha,
      },
      $type: "color",
      $extensions: {
        "com.tokenscout.css-authored-as": cluster.canonical,
        "com.tokenscout.usage-count": cluster.totalCount,
        "com.tokenscout.css-properties": cluster.cssProperties,
        "com.tokenscout.member-count": cluster.members.length,
        "com.tokenscout.members": cluster.members,
      },
    };
  }

  // Group-level sprawl metrics (DTCG group `$extensions`). sprawl-ratio =
  // analyzable distinct strings / perceptual clusters; >1 means near-duplicate
  // redundancy (e.g. "44 declared -> 9 distinct = 4.89x").
  const analyzable = analyzableValues.size;
  const distinct = clusters.length;
  group.$extensions = {
    "com.tokenscout.analyzable": analyzable,
    "com.tokenscout.unanalyzable": unanalyzableValues.size,
    "com.tokenscout.distinct": distinct,
    "com.tokenscout.sprawl-ratio":
      Math.round((analyzable / distinct) * 100) / 100,
  };
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
