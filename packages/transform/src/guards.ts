import type { ColorValue, DimensionValue, DurationValue, DesignToken } from "tokenscout/schema";

export function isColorValue(v: unknown): v is ColorValue {
  return typeof v === "object" && v !== null && "colorSpace" in v;
}

export function isDimensionValue(v: unknown): v is DimensionValue {
  return (
    typeof v === "object" &&
    v !== null &&
    "value" in v &&
    "unit" in v &&
    ((v as DimensionValue).unit === "px" || (v as DimensionValue).unit === "rem")
  );
}

export function isDurationValue(v: unknown): v is DurationValue {
  return (
    typeof v === "object" &&
    v !== null &&
    "value" in v &&
    "unit" in v &&
    ((v as DurationValue).unit === "ms" || (v as DurationValue).unit === "s")
  );
}

export function isToken(v: unknown): v is DesignToken {
  return typeof v === "object" && v !== null && "$value" in v;
}
