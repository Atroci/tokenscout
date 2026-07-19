// sRGB → CIE Lab (D65), ΔE76 and ΔE2000. Pure TypeScript, zero dependencies.
//
// The math is inlined intentionally: the formulas are short enough to maintain
// directly, and inlining keeps the package free of runtime dependencies.

/** CIE Lab triple: [L*, a*, b*]. */
export type Lab = readonly [L: number, a: number, b: number];

/** Linear sRGB channels in the 0..1 range. */
export type Rgb = readonly [r: number, g: number, b: number];

// D65 reference white (CIE 1931 2° observer).
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;

// sRGB → linear-RGB → XYZ matrix (D65).
const M = [
  [0.4124, 0.3576, 0.1805],
  [0.2126, 0.7152, 0.0722],
  [0.0193, 0.1192, 0.9505],
] as const;

/** sRGB gamma decode (single channel, 0..1). */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Lab piecewise transform. */
function fLab(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta ** 2) + 4 / 29;
}

/** Convert sRGB (channels in 0..1) to CIE Lab (D65). */
export function rgbToLab([r, g, b]: Rgb): Lab {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  const x = M[0][0] * rl + M[0][1] * gl + M[0][2] * bl;
  const y = M[1][0] * rl + M[1][1] * gl + M[1][2] * bl;
  const z = M[2][0] * rl + M[2][1] * gl + M[2][2] * bl;
  const fx = fLab(x / XN);
  const fy = fLab(y / YN);
  const fz = fLab(z / ZN);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Round a Lab triple to 2 decimal places, preserving the tuple type. */
export function roundLab([L, a, b]: Lab): Lab {
  const r = (v: number) => Math.round(v * 100) / 100;
  return [r(L), r(a), r(b)];
}

/** Euclidean CIE76 color difference between two Lab values. */
export function deltaE76(a: Lab, b: Lab): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

const DEG = Math.PI / 180;
const POW25_7 = 25 ** 7;

/**
 * CIEDE2000 color difference (Sharma, Wu & Dalal 2005). Weights lightness,
 * chroma and hue differences per the eye's actual sensitivity, so near-neutral
 * grays and saturated hues cluster on the same numeric threshold — ΔE76's
 * known weakness. kL = kC = kH = 1.
 */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + POW25_7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const h1p = c1p === 0 ? 0 : (Math.atan2(b1, a1p) / DEG + 360) % 360;
  const h2p = c2p === 0 ? 0 : (Math.atan2(b2, a2p) / DEG + 360) % 360;

  const dLp = L2 - L1;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin((dhp * DEG) / 2);

  const lBar = (L1 + L2) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBar = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hBar += hBar < 360 ? 360 : -360;
    hBar /= 2;
  }

  const t =
    1 -
    0.17 * Math.cos((hBar - 30) * DEG) +
    0.24 * Math.cos(2 * hBar * DEG) +
    0.32 * Math.cos((3 * hBar + 6) * DEG) -
    0.2 * Math.cos((4 * hBar - 63) * DEG);
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + POW25_7));
  const sL = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * t;
  const rT = -Math.sin(2 * dTheta * DEG) * rC;

  const l = dLp / sL;
  const c = dCp / sC;
  const h = dHp / sH;
  return Math.sqrt(l * l + c * c + h * h + rT * c * h);
}
