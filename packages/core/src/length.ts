// Parse CSS length values (px, rem) into px. Intentionally minimal: the only
// units the extractor emits for type/spacing today. Shared by the type and
// spacing reducers (two real call sites). Returns null if unrecognized.

const LENGTH_RE = /^\s*(-?\d+(?:\.\d+)?)\s*(px|rem)\s*$/i;

/** Default root font-size in px when the extractor doesn't supply the true one. */
export const DEFAULT_ROOT_PX = 16;

/** Parse `<number>px` or `<number>rem` to px (rem * rootPx). Null otherwise. */
export function parseLength(
  value: string,
  rootPx: number = DEFAULT_ROOT_PX,
): number | null {
  const m = LENGTH_RE.exec(value);
  if (!m) return null;
  const n = +m[1];
  const px = m[2].toLowerCase() === "rem" ? n * rootPx : n;
  // A long-enough digit run overflows to Infinity, which would propagate into
  // the reducers' arithmetic (gcd loops forever on a non-finite value). Reject
  // it at the boundary so only finite px ever leave this function.
  return Number.isFinite(px) ? px : null;
}
