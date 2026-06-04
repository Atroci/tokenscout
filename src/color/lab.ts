// sRGB → CIE Lab (D65) and ΔE76. Pure TypeScript, zero dependencies.
//
// Ported from the web-forensics color reducer. The math is inlined
// intentionally — colormath is broken on NumPy 2.0+ and the formulas are
// short enough to maintain directly. No runtime deps in JS either.

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

/** Euclidean CIE76 color difference between two Lab values. */
export function deltaE76(a: Lab, b: Lab): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}
