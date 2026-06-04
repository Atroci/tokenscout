// Parse CSS color strings (hex, rgb(), rgba()) into normalized sRGB + alpha.
// Intentionally minimal — extend toward hsl()/lab()/oklch() as needed.

import type { Rgb } from "./lab.js";

export interface ParsedColor {
  /** sRGB channels in 0..1. */
  rgb: Rgb;
  /** Alpha in 0..1 (1 when omitted). */
  alpha: number;
}

const RGB_RE =
  /^\s*rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d+(?:\.\d+)?)\s*)?\)\s*$/i;

/** Parse `rgb()`, `rgba()`, or `#hex` (3/4/6/8). Returns null if unrecognized. */
export function parseColor(value: string): ParsedColor | null {
  const v = value.trim();

  const m = RGB_RE.exec(v);
  if (m) {
    return {
      rgb: [+m[1] / 255, +m[2] / 255, +m[3] / 255],
      alpha: m[4] !== undefined ? +m[4] : 1,
    };
  }

  return parseHex(v);
}

function parseHex(v: string): ParsedColor | null {
  if (!v.startsWith("#")) return null;
  let h = v.slice(1);
  if (![3, 4, 6, 8].includes(h.length) || /[^0-9a-f]/i.test(h)) return null;
  if (h.length <= 4) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { rgb: [r, g, b], alpha };
}
