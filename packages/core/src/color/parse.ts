// Parse CSS color strings (hex, rgb(), rgba(), hsl(), hsla(), named) into
// normalized sRGB + alpha. oklch()/lab()/lch()/color()/hwb() remain
// unsupported and return null (documented limitations).

import type { Rgb } from "./lab.js";
import { NAMED_COLORS } from "./named.js";

export interface ParsedColor {
  /** sRGB channels in 0..1. */
  rgb: Rgb;
  /** Alpha in 0..1 (1 when omitted). */
  alpha: number;
}

const RGB_RE =
  /^\s*rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d+(?:\.\d+)?)\s*)?\)\s*$/i;

// hsl()/hsla(), comma OR space syntax. Hue: number with optional "deg".
// Saturation/lightness: percentages. Optional alpha: number or percentage,
// after a "," (comma syntax) or "/" (space syntax).
const HSL_RE =
  /^\s*hsla?\(\s*(-?\d+(?:\.\d+)?)(?:deg)?\s*(?:,\s*|\s+)(\d+(?:\.\d+)?)%\s*(?:,\s*|\s+)(\d+(?:\.\d+)?)%\s*(?:(?:,|\/)\s*(\d+(?:\.\d+)?)(%?)\s*)?\)\s*$/i;

/**
 * Parse `rgb()`, `rgba()`, `hsl()`, `hsla()`, `#hex` (3/4/6/8), or a CSS named
 * color. Returns null for unrecognized input and for oklch()/lab()/lch()/
 * color()/hwb() (documented limitations).
 */
export function parseColor(value: string): ParsedColor | null {
  const v = value.trim();

  const m = RGB_RE.exec(v);
  if (m) {
    const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
    return {
      rgb: [clamp(+m[1] / 255), clamp(+m[2] / 255), clamp(+m[3] / 255)],
      alpha: m[4] !== undefined ? clamp(+m[4]) : 1,
    };
  }

  const hslMatch = HSL_RE.exec(v);
  if (hslMatch) {
    const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
    const rgb = hslToRgb(+hslMatch[1], +hslMatch[2] / 100, +hslMatch[3] / 100);
    let alpha = 1;
    if (hslMatch[4] !== undefined) {
      alpha = hslMatch[5] === "%" ? +hslMatch[4] / 100 : +hslMatch[4];
    }
    return { rgb, alpha: clamp(alpha) };
  }

  const named = NAMED_COLORS[v.toLowerCase()];
  if (named) return parseHex(named);

  return parseHex(v);
}

/** Convert HSL (hue in deg, s/l in 0..1) to sRGB channels in 0..1. */
function hslToRgb(hDeg: number, s: number, l: number): Rgb {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const sat = s < 0 ? 0 : s > 1 ? 1 : s;
  const lum = l < 0 ? 0 : l > 1 ? 1 : l;
  if (sat === 0) return [lum, lum, lum];
  const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
  const p = 2 * lum - q;
  const hue = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
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
