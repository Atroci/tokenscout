// Render one DTCG token's $value as a CSS literal. Shared by css-vars and
// tailwind emitters so both read tokens the same way.

import type {
  ColorValue,
  DesignToken,
  DimensionValue,
  DurationValue,
} from "tokenscout/schema";

/** Round to 2 decimal places for compact, stable output. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Clamp a 0..1 sRGB channel to a valid 0..255 byte. tokenscout's own color
 * group always emits in-range components, but $type/$value is a spec-shaped
 * DTCG contract other tools can also produce — an out-of-range or rounding-
 * artifact component (1.0002, -0.0001) would otherwise emit an invalid
 * rgb()/rgba() literal. */
function clamp255(c: number): number {
  return Math.min(255, Math.max(0, Math.round(c * 255)));
}

/** Quote a font-family name if it contains whitespace (CSS requires it). */
function quoteFamily(name: string): string {
  return /\s/.test(name) ? `"${name}"` : name;
}

/**
 * Render a DTCG token's `$value` as the CSS literal it represents. Reads only
 * `$type`/`$value` (the spec-defined shape) — never tokenscout-specific
 * `$extensions` — so this also works on DTCG documents from other tools.
 */
export function renderValue(token: DesignToken): string {
  switch (token.$type) {
    case "color": {
      const v = token.$value as ColorValue;
      const [r, g, b] = v.components.map(clamp255);
      return v.alpha < 1
        ? `rgba(${r}, ${g}, ${b}, ${round2(v.alpha)})`
        : `rgb(${r}, ${g}, ${b})`;
    }
    case "dimension":
    case "duration": {
      const v = token.$value as DimensionValue | DurationValue;
      return `${v.value}${v.unit}`;
    }
    case "fontFamily": {
      const stack = token.$value as string[];
      return stack.map(quoteFamily).join(", ");
    }
    case "fontWeight":
      return String(token.$value);
    default:
      return String(token.$value);
  }
}
