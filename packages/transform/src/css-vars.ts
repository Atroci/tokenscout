import type { DesignToken, DesignTokens, TokenGroup } from "tokenscout/schema";
import { renderValue } from "./render-value.js";

/** camelCase group name -> kebab-case, e.g. "fontSize" -> "font-size". */
function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * `--<group>-<key>`, unless `key` already reads as that group (every builtin
 * reducer except color already bakes its group name into the key, e.g.
 * `font-size-1`) — avoids `--font-size-font-size-1`-style doubling.
 */
function cssVarName(group: string, key: string): string {
  const groupKebab = kebab(group);
  return key.startsWith(groupKebab) ? `--${key}` : `--${groupKebab}-${key}`;
}

/** Render a DTCG token document as a `:root { --token: value; }` block. */
export function renderCssVars(tokens: DesignTokens): string {
  const lines: string[] = [];
  for (const [group, value] of Object.entries(tokens)) {
    if (group.startsWith("$") || typeof value !== "object" || value === null)
      continue;
    for (const [key, token] of Object.entries(value as TokenGroup)) {
      if (key.startsWith("$")) continue;
      lines.push(
        `  ${cssVarName(group, key)}: ${renderValue(token as DesignToken)};`,
      );
    }
  }
  return `:root {\n${lines.join("\n")}\n}\n`;
}

export { cssVarName };
