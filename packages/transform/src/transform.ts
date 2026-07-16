import type { DesignTokens } from "tokenscout/schema";
import { renderCssVars } from "./css-vars.js";
import { renderTailwindConfig } from "./tailwind.js";

export type TransformFormat = "css-vars" | "tailwind";

/**
 * Render a DTCG token document (from `tokenscout`'s `assembleTokens`, or any
 * spec-shaped DTCG document) as a drop-in CSS or Tailwind config file.
 *
 * Not yet supported: a `shadcn` target. shadcn's `--background`/`--primary`
 * variables are semantic roles; tokenscout only emits raw perceptual clusters
 * today, so a shadcn mapping would be a guess dressed up as data. Add once
 * semantic role inference (background/text/action/border) exists upstream.
 */
export function transform(
  tokens: DesignTokens,
  format: TransformFormat,
): string {
  switch (format) {
    case "css-vars":
      return renderCssVars(tokens);
    case "tailwind":
      return renderTailwindConfig(tokens);
    default:
      throw new Error(
        `@tokenscout/transform: unsupported format "${format as string}". Supported: css-vars, tailwind.`,
      );
  }
}
