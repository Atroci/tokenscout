// Stable, content-derived ids for color tokens. Pure TypeScript, zero dependencies.
//
// WHY: positional ids (color-1, color-2, ...) reshuffle whenever a color is
// added, removed, or reordered upstream: which makes every run produce a noisy
// diff even when the palette barely changed. For design-system drift audits we
// want ids that stay put: an id derived from the verbatim canonical CSS string
// is stable across runs and across reordering, so a token diff reflects real
// palette change, not list churn. This mirrors projectwallace/css-design-tokens,
// which hashes token values to get stable, diffable ids.

/**
 * Deterministic FNV-1a 32-bit hash of a string, returned as base36 and padded
 * to exactly 7 chars. Pure; same input always yields the same output.
 */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Coerce to an unsigned 32-bit value before base36 stringification.
  const hex = (h >>> 0).toString(36);
  return hex.padStart(7, "0").slice(-7);
}

/**
 * Stable token id of the form `${name}-${hash}`, where the hash is taken over
 * the verbatim canonical CSS string. Stable across runs and across reordering.
 */
export function stableColorId(canonical: string, name: string): string {
  return `${name}-${hashString(canonical)}`;
}
