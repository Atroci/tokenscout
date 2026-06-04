// src/schema.ts
// The shared boundary contract: produced by @tokenscout/extract (deferred,
// browser-side), consumed by core's pure reducers. Zero runtime deps.

/** One observed color and the CSS property it was painted from. */
export interface ColorObservation {
  /** Verbatim CSS color string (hex / rgb() / rgba()). */
  value: string;
  /** CSS property the color was read from, e.g. "color", "background-color". */
  role: string;
  /** Occurrence weight across the rendered DOM. */
  count: number;
}

/** Observed typographic sizes for one page/breakpoint. */
export interface TypeObservation {
  /** Verbatim font-size values, e.g. "16px", "1.5rem". */
  sizes: string[];
}

/** Observed spacing values (margin/padding/gap) for one page/breakpoint. */
export interface SpacingObservation {
  /** Verbatim length values, e.g. "8px", "0.5rem", "24px". */
  values: string[];
}

/** Everything one rendered page yields at one breakpoint. The seam type. */
export interface PageExtract {
  url: string;
  /** Viewport width in px. */
  breakpoint: number;
  colors: ColorObservation[];
  type: TypeObservation;
  spacing: SpacingObservation;
}

/** A single W3C DTCG token (minimal valid shape). */
export interface DesignToken {
  $value: string | DimensionValue;
  $type: "color" | "dimension";
  $description?: string;
}

/** DTCG dimension value object. */
export interface DimensionValue {
  value: number;
  /** v1 reducers only ever emit "px"; "rem" is reserved for a future unit-preserving mode. */
  unit: "px" | "rem";
}

/** A DTCG group: either nested groups or leaf tokens. */
export interface TokenGroup {
  [key: string]: DesignToken | TokenGroup;
}

/** The assembled design-token document, W3C DTCG-shaped. */
export type DesignTokens = TokenGroup;
