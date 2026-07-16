import type { DesignTokens, TokenGroup } from "tokenscout/schema";
import { cssVarName } from "./css-vars.js";

/** camelCase group name -> kebab-case, matching css-vars.ts. */
function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/** Drop the redundant group prefix a key already carries (e.g. "font-size-1"
 * under group "fontSize" -> "1"), so Tailwind utilities read `text-1` instead
 * of `text-font-size-1`. Color keys have no such prefix and pass through. */
function tailwindKey(group: string, key: string): string {
  const prefix = `${kebab(group)}-`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

/** Which `theme.extend` bucket a DTCG group maps to. Groups with no mapping
 * (unknown future groups) are skipped rather than guessed at. */
const THEME_KEY: Record<string, string> = {
  color: "colors",
  fontSize: "fontSize",
  fontFamily: "fontFamily",
  fontWeight: "fontWeight",
  lineHeight: "lineHeight",
  spacing: "spacing",
  duration: "transitionDuration",
};

/**
 * Render a DTCG token document as a `tailwind.config.js` `theme.extend` block.
 * Values are `var(--...)` references into the sibling css-vars output, not
 * inlined literals — regenerating the CSS vars alone (e.g. from a re-scout)
 * keeps this config valid without a rebuild.
 */
export function renderTailwindConfig(tokens: DesignTokens): string {
  const extend: Record<string, Record<string, string>> = {};

  for (const [group, value] of Object.entries(tokens)) {
    const themeKey = THEME_KEY[group];
    if (
      !themeKey ||
      group.startsWith("$") ||
      typeof value !== "object" ||
      value === null
    ) {
      continue;
    }
    const bucket: Record<string, string> = {};
    for (const key of Object.keys(value as TokenGroup)) {
      if (key.startsWith("$")) continue;
      bucket[tailwindKey(group, key)] = `var(${cssVarName(group, key)})`;
    }
    if (Object.keys(bucket).length > 0) extend[themeKey] = bucket;
  }

  return (
    "/** @type {import('tailwindcss').Config} */\n" +
    "module.exports = {\n" +
    "  theme: {\n" +
    `    extend: ${JSON.stringify(extend, null, 6).replace(/\n/g, "\n    ")},\n` +
    "  },\n" +
    "};\n"
  );
}
