// Worked example: hand-built page observations -> a W3C DTCG token document.
// Run: npx tsx examples/quickstart.ts
import { assembleTokens } from "../src/tokens/index.js";
import { clusterColors, parseColor } from "../src/color/index.js";
import type { PageExtract } from "../src/schema.js";

// What an extractor (or you, by hand) feeds in: raw computed-style observations
// from a rendered page. Note the near-duplicate blues a real stylesheet emits.
const pages: PageExtract[] = [
  {
    url: "https://example.com/",
    breakpoint: 1280,
    colors: [
      { value: "#3a7bd5", role: "background-color", count: 40 },
      { value: "#3b7cd6", role: "color", count: 5 },
      { value: "rgb(58, 123, 213)", role: "border-color", count: 2 },
      { value: "#3A7BD4", role: "color", count: 3 },
      { value: "#e23744", role: "color", count: 12 },
      { value: "#e13643", role: "background-color", count: 4 },
      { value: "#ffffff", role: "background-color", count: 88 },
      { value: "#fefefe", role: "color", count: 9 },
      { value: "#111827", role: "color", count: 61 },
    ],
    type: { sizes: ["16px", "20px", "25px", "31.25px", "39px"] },
    spacing: { values: ["8px", "16px", "24px", "32px", "48px"] },
  },
];

const tokens = assembleTokens(pages);
console.log("design-tokens.json:\n" + JSON.stringify(tokens, null, 2));

// The headline number, computed not claimed:
const parsed = pages[0].colors
  .map((c) => {
    const p = parseColor(c.value);
    return p ? { value: c.value, rgb: p.rgb, count: c.count } : null;
  })
  .filter((c) => c !== null);
console.log(
  `\n${parsed.length} declared colors -> ${clusterColors(parsed).length} perceptual clusters`,
);
