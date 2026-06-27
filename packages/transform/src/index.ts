import { toCssVars } from "./css-vars.js";
import { toTailwindConfig } from "./tailwind.js";

export { toCssVars } from "./css-vars.js";
export { toTailwindConfig } from "./tailwind.js";
export type { DesignTokens } from "tokenscout/schema";

export type OutputFormat = "css-vars" | "tailwind" | "dtcg";

export function transform(
  tokens: import("tokenscout/schema").DesignTokens,
  format: OutputFormat
): string | Record<string, unknown> {
  switch (format) {
    case "css-vars": return toCssVars(tokens);
    case "tailwind": return toTailwindConfig(tokens);
    case "dtcg": return JSON.stringify(tokens, null, 2);
    default: throw new Error(`Unknown format: ${format as string}`);
  }
}
