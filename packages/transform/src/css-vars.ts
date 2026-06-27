import type { DesignTokens, DesignToken } from "tokenscout/schema";
import { isColorValue, isDimensionValue, isDurationValue, isToken } from "./guards.js";

function sanitizeCssIdent(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function clamp255(c: number): number {
  return Math.min(255, Math.max(0, Math.round(c * 255)));
}

function tokenToCss(token: DesignToken): string | null {
  const v = token.$value;
  if (isColorValue(v)) {
    const [r, g, b] = v.components.map(clamp255);
    const alpha = v.alpha ?? 1;
    return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (isDimensionValue(v) || isDurationValue(v)) return `${v.value}${v.unit}`;
  if (typeof v === "string") return v;
  return null;
}

function* walkTokens(
  obj: Record<string, unknown>,
  prefix: string
): Generator<[string, DesignToken]> {
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("$")) continue;
    const ident = sanitizeCssIdent(key);
    const name = prefix ? `${prefix}-${ident}` : ident;
    if (isToken(val)) {
      yield [name, val];
    } else if (typeof val === "object" && val !== null) {
      yield* walkTokens(val as Record<string, unknown>, name);
    }
  }
}

export function toCssVars(tokens: DesignTokens): string {
  const lines: string[] = [":root {"];
  for (const [name, token] of walkTokens(tokens as Record<string, unknown>, "")) {
    const val = tokenToCss(token);
    if (val !== null) lines.push(`  --${name}: ${val};`);
  }
  lines.push("}");
  return lines.join("\n");
}
