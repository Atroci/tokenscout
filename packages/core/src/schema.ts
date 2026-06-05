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

/** DTCG structured color value (sRGB). */
export interface ColorValue {
  colorSpace: "srgb";
  components: [number, number, number];
  alpha: number;
}

/** A single W3C DTCG token (minimal valid shape). */
export interface DesignToken {
  $value: string | ColorValue | DimensionValue | DurationValue;
  $type: "color" | "dimension" | "duration";
  $description?: string;
  $extensions?: Record<string, unknown>;
}

/** DTCG dimension value object. */
export interface DimensionValue {
  value: number;
  /** v1 reducers only ever emit "px"; "rem" is reserved for a future unit-preserving mode. */
  unit: "px" | "rem";
}

/** DTCG duration value object. The animation reducer emits milliseconds. */
export interface DurationValue {
  value: number;
  unit: "ms" | "s";
}

/** Motion observations fed into assembleTokens. Durations are in milliseconds. */
export interface AnimationInput {
  durations?: number[];
}

/** A DTCG group: leaf tokens or nested groups, plus optional group-level
 * `$extensions`. tokenscout emits color-sprawl audit metrics there (analyzable,
 * unanalyzable, distinct, sprawl-ratio). Per DTCG, `$`-prefixed members are
 * reserved metadata, not tokens — consumers counting tokens skip them. */
export interface TokenGroup {
  [key: string]: DesignToken | TokenGroup | Record<string, unknown> | undefined;
  $extensions?: Record<string, unknown>;
}

/** The assembled design-token document, W3C DTCG-shaped. */
export type DesignTokens = TokenGroup;
