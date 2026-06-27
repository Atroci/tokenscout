// Parse CSS color strings into normalized sRGB + alpha. Supported: hex, rgb(),
// rgba(), hsl(), hsla(), named, and the CSS Color 4 function forms oklch(),
// oklab(), lab(), lch(), and hwb() (converted to sRGB). color(): the
// parameterized multi-colorspace form (display-p3, rec2020, xyz, ...): remains
// unsupported and returns null (documented limitation; deferred until a real
// site uses it).

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
 * Parse `rgb()`, `rgba()`, `hsl()`, `hsla()`, `#hex` (3/4/6/8), a CSS named
 * color, or the CSS Color 4 functions `oklch()`/`oklab()`/`lab()`/`lch()`/
 * `hwb()`. Returns null for unrecognized input and for `color()` (documented
 * limitation).
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

  const modern = parseModernColor(v);
  if (modern) return modern;

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

// --- CSS Color 4 function forms: oklch/oklab/lab/lch/hwb -------------------
// These are canonical CSS Color 4 (oklch is the Tailwind v4 default), not fringe
// syntax: without them, colors authored in these spaces would silently drop.
// The math is inlined to keep the package dependency-free, mirroring lab.ts.

const MODERN_RE = /^(oklch|oklab|lab|lch|hwb)\(\s*(.+?)\s*\)$/i;

/**
 * Parse the CSS Color 4 function forms to sRGB. Space-separated components with
 * an optional `/ alpha`; `none` reads as 0; angles accept deg/grad/rad/turn
 * (bare = deg). Out-of-sRGB-gamut results are clamped per channel: full gamut
 * mapping is out of scope. Returns null for anything else (including color()).
 */
function parseModernColor(value: string): ParsedColor | null {
  const m = MODERN_RE.exec(value);
  if (!m) return null;
  const fn = m[1].toLowerCase();
  const [body, alphaTok] = m[2].split("/");
  const parts = body.trim().split(/\s+/);
  if (parts.length < 3) return null;

  let rgb: Rgb;
  switch (fn) {
    case "oklch":
      rgb = oklchToRgb(comp(parts[0], 1), comp(parts[1], 0.4), angleDeg(parts[2]));
      break;
    case "oklab":
      rgb = oklabToRgb(comp(parts[0], 1), comp(parts[1], 0.4), comp(parts[2], 0.4));
      break;
    case "lab":
      rgb = labToRgb(comp(parts[0], 100), comp(parts[1], 125), comp(parts[2], 125));
      break;
    case "lch":
      rgb = lchToRgb(comp(parts[0], 100), comp(parts[1], 150), angleDeg(parts[2]));
      break;
    default: // hwb
      rgb = hwbToRgb(angleDeg(parts[0]), comp(parts[1], 1), comp(parts[2], 1));
      break;
  }

  const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
  const alpha = alphaTok === undefined ? 1 : comp(alphaTok, 1);
  return {
    rgb: [clamp(rgb[0]), clamp(rgb[1]), clamp(rgb[2])],
    alpha: clamp(alpha),
  };
}

/** One component token to a number: `none`→0, `N%`→N/100·pctRef, else the number. */
function comp(tok: string, pctRef: number): number {
  const t = tok.trim().toLowerCase();
  if (t === "none") return 0;
  if (t.endsWith("%")) return (parseFloat(t) / 100) * pctRef;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/** One hue/angle token to degrees: supports deg (bare), grad, rad, turn. */
function angleDeg(tok: string): number {
  const t = tok.trim().toLowerCase();
  if (t === "none") return 0;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return 0;
  if (t.endsWith("turn")) return n * 360;
  if (t.endsWith("grad")) return n * 0.9;
  if (t.endsWith("rad")) return (n * 180) / Math.PI;
  return n;
}

/** Linear-light sRGB channel → gamma-encoded sRGB (0..1). */
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** CIE XYZ (D65) → gamma-encoded sRGB. Inverse of lab.ts's sRGB→XYZ matrix. */
function xyzToSrgb(x: number, y: number, z: number): Rgb {
  const rl = 3.2406 * x - 1.5372 * y - 0.4986 * z;
  const gl = -0.9689 * x + 1.8758 * y + 0.0415 * z;
  const bl = 0.0557 * x - 0.204 * y + 1.057 * z;
  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)];
}

/** CIE Lab (D65) → gamma-encoded sRGB. */
function labToRgb(L: number, a: number, b: number): Rgb {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const d = 6 / 29;
  const finv = (t: number) => (t > d ? t * t * t : 3 * d * d * (t - 4 / 29));
  // D65 reference white (XN, YN, ZN), matching lab.ts.
  return xyzToSrgb(0.95047 * finv(fx), 1.0 * finv(fy), 1.08883 * finv(fz));
}

/** CIE LCH → gamma-encoded sRGB (polar form of Lab). */
function lchToRgb(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  return labToRgb(L, C * Math.cos(h), C * Math.sin(h));
}

/** OKLab → gamma-encoded sRGB (Björn Ottosson's matrices). */
function oklabToRgb(L: number, a: number, b: number): Rgb {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const rl = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gl = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)];
}

/** OKLCH → gamma-encoded sRGB (polar form of OKLab). */
function oklchToRgb(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  return oklabToRgb(L, C * Math.cos(h), C * Math.sin(h));
}

/** HWB (hue in deg; whiteness/blackness in 0..1) → gamma-encoded sRGB. */
function hwbToRgb(hDeg: number, w: number, b: number): Rgb {
  if (w + b >= 1) {
    const g = w / (w + b);
    return [g, g, g];
  }
  const [r, g, bl] = hslToRgb(hDeg, 1, 0.5);
  const mix = (c: number) => c * (1 - w - b) + w;
  return [mix(r), mix(g), mix(bl)];
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
