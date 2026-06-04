// tokenscout: extract design tokens from a live, rendered website.
//
// First public surface: perceptual color analysis. Type and spacing scale
// extraction follow.

export type * from "./schema.js";
export * from "./color/index.js";

export { reduceTypeScale, type TypeScale } from "./type/index.js";
export { reduceSpacingScale, type SpacingScale } from "./spacing/index.js";
export { assembleTokens, type AssembleOptions } from "./tokens/index.js";
