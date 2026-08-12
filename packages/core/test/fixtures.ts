// Shared PageExtract[] builders for core's test suite. Extracted because
// tokens.test.ts and determinism.test.ts each hand-rolled their own
// near-identical fixture (same color palette pattern, same shape) before this
// existed — one drifting from the other silently was a real risk. Each
// builder returns a fresh array (no shared mutable state between callers);
// determinism.test.ts additionally deep-clones per call, since its whole
// point is proving assembleTokens doesn't depend on shared references.
import type { PageExtract } from "../src/schema.js";

/**
 * Minimal two-breakpoint, four-color fixture. Enough to exercise all three
 * DTCG groups (color/fontSize/spacing) without clustering ambiguity — used
 * where the test cares about assembly shape, not palette-reduction behavior.
 */
export function simplePages(): PageExtract[] {
  return [
    {
      url: "https://example.com/",
      breakpoint: 1280,
      colors: [
        { value: "#3a7bd5", role: "background-color", count: 40 },
        { value: "#3b7cd6", role: "color", count: 5 },
        { value: "rgb(58, 123, 213)", role: "border-color", count: 2 },
        { value: "#e23744", role: "color", count: 12 },
      ],
      type: { sizes: ["16px", "24px", "1.5rem"] },
      spacing: { values: ["8px", "16px", "1.5rem"] },
    },
    {
      url: "https://example.com/",
      breakpoint: 375,
      colors: [{ value: "#e23744", role: "background-color", count: 3 }],
      type: { sizes: ["14px", "16px"] },
      spacing: { values: ["8px", "0.5rem"] },
    },
  ];
}

/**
 * Denser two-page, six-color fixture. Enough colors, sizes, and spacing
 * values to exercise clustering and scale detection, not just pass-through —
 * used where the test cares about reduction behavior itself (determinism,
 * clustering, scale detection), not just assembly shape.
 */
export function densePages(): PageExtract[] {
  return [
    {
      url: "https://example.com/",
      breakpoint: 1280,
      colors: [
        { value: "#3a7bd5", role: "background-color", count: 40 },
        { value: "#3b7cd6", role: "color", count: 5 },
        { value: "rgb(58, 123, 213)", role: "border-color", count: 2 },
        { value: "#e23744", role: "color", count: 12 },
        { value: "#ffffff", role: "background-color", count: 80 },
        { value: "#111111", role: "color", count: 60 },
      ],
      type: { sizes: ["16px", "24px", "1.5rem", "14px", "32px"] },
      spacing: { values: ["8px", "16px", "1.5rem", "4px", "24px", "64px"] },
    },
    {
      url: "https://example.com/about",
      breakpoint: 375,
      colors: [
        { value: "#e23744", role: "background-color", count: 3 },
        { value: "#3a7bd5", role: "color", count: 9 },
      ],
      type: { sizes: ["14px", "16px", "20px"] },
      spacing: { values: ["8px", "0.5rem", "12px"] },
    },
  ];
}
