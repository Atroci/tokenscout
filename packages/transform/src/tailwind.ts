import type { DesignTokens, ColorValue } from "tokenscout/schema";
import { isColorValue, isDimensionValue, isDurationValue, isToken } from "./guards.js";

function clamp255(c: number): number {
  return Math.min(255, Math.max(0, Math.round(c * 255)));
}

function colorToValue(v: ColorValue): string {
  const [r, g, b] = v.components.map(clamp255);
  const alpha = v.alpha ?? 1;
  if (alpha === 1) {
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const GROUP_MAP: Record<string, string> = {
  color: "colors",
  "font-size": "fontSize",
  fontSize: "fontSize", // ponytail: assembleTokens() emits camelCase; keep "font-size" for hand-authored DTCG files
  spacing: "spacing",
  duration: "transitionDuration",
};

export function toTailwindConfig(tokens: DesignTokens): Record<string, unknown> {
  const extend: Record<string, Record<string, string>> = {};

  for (const [group, entries] of Object.entries(tokens)) {
    const themeKey = GROUP_MAP[group];
    if (!themeKey || typeof entries !== "object" || entries === null) continue;
    const section: Record<string, string> = {};

    for (const [name, token] of Object.entries(entries as Record<string, unknown>)) {
      if (name.startsWith("$") || !isToken(token)) continue;
      const v = token.$value;
      let val: string | null = null;

      if (isColorValue(v)) val = colorToValue(v);
      else if (isDimensionValue(v) || isDurationValue(v)) val = `${v.value}${v.unit}`;
      else if (typeof v === "string") val = v;

      if (val !== null) section[name] = val;
    }

    if (Object.keys(section).length > 0) extend[themeKey] = section;
  }

  return { theme: { extend } };
}
