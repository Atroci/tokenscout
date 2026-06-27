# tokenscout: Codex usage

Three ways to use tokenscout inside Codex:

| Surface | Install | When to use |
|---------|---------|------------|
| `/tokenscout` skill | `npx skills add Atroci/tokenscout` | One-shot extraction in a Codex session |
| `@tokenscout/extract` API | `npm install @tokenscout/extract playwright` | Automated extraction inside a task |
| `@tokenscout/transform` | `npm install @tokenscout/transform` | Convert DTCG output to CSS vars or Tailwind |

---

## `/tokenscout` skill

### Install

```bash
# Global: available in every project
npx skills add Atroci/tokenscout --global

# Project-local: scoped to this repo
npx skills add Atroci/tokenscout
```

Verify:

```bash
npx skills list
```

### Invoke in a Codex session

```
/tokenscout https://example.com
/tokenscout https://example.com --format css-vars
/tokenscout https://example.com --format tailwind
/tokenscout https://example.com --quick
```

| Flag | Description |
|------|-------------|
| `--format dtcg` | W3C DTCG JSON (default) |
| `--format css-vars` | `:root { --color-... }` block |
| `--format tailwind` | `theme.extend` object for `tailwind.config.js` |
| `--quick` | Skip icons, topology, assets (faster run) |

The skill handles all dependencies automatically on first run:
installs `@tokenscout/extract`, `playwright`, Chromium, and `@tokenscout/transform`
if they are missing.

### What Codex surfaces

After extraction, Codex presents:

- **Color palette**: perceptual clusters with hex values, CSS property roles, element counts
- **Type scale**: font sizes sorted by size, detected modular ratio
- **Spacing grid**: values and GCD base unit
- **Animation model**: durations, easings, perf-smell flags, `prefers-reduced-motion` gap detection
- **Tech stack**: detected framework with confidence score
- **Page topology**: section positions, sticky/fixed/full-screen flags (skipped with `--quick`)
- **Icons**: unique SVG count and first 5 entries (skipped with `--quick`)

---

## `@tokenscout/extract` API in a Codex task

When you need extraction inside a task script (not a slash command), import the
library directly.

```bash
npm install @tokenscout/extract playwright
npx playwright install chromium
```

### `extractTokens` (tokens only, lightweight)

```typescript
import { extractTokens } from "@tokenscout/extract";

const tokens = await extractTokens("https://example.com", {
  breakpoints: [1440, 375],
  deltaE: 12,        // CIELAB deltaE76 clustering threshold
});

// tokens is a DesignTokens (W3C DTCG) object:
// { color: {...}, fontSize: {...}, spacing: {...}, duration: {...} }
```

### `inspectSite` (full report)

```typescript
import { inspectSite } from "@tokenscout/extract";

const report = await inspectSite("https://example.com", {
  breakpoints: [1440, 768, 375],
  deltaE: 12,
  icons: true,       // SVG icon manifest
  topology: true,    // page section map
  assets: true,      // image/background asset manifest
  animations: true,  // CSS animation tokens + perf-smell flags
});

report.tokens;     // DTCG design tokens
report.icons;      // deduplicated SVG icons
report.topology;   // page sections with positions and flags
report.assets;     // image and background asset manifest
report.animations; // durations, easings, reduced-motion gap
report.stack;      // detected framework + confidence
```

### `assembleTokens` (from your own observations)

If you have your own computed-style data (e.g. from a custom crawler), skip
Playwright entirely:

```typescript
import { assembleTokens } from "tokenscout/tokens";
import type { PageExtract } from "tokenscout/schema";

const pages: PageExtract[] = [
  {
    url: "https://example.com/",
    breakpoint: 1280,
    colors: [
      { value: "#3a7bd5", role: "background-color", count: 40 },
      { value: "#e23744", role: "color", count: 12 },
    ],
    type: { sizes: ["16px", "20px", "32px"] },
    spacing: { values: ["8px", "16px", "24px"] },
  },
];

const tokens = assembleTokens(pages);
```

---

## `@tokenscout/transform` in a Codex task

Convert DTCG output to CSS custom properties or a Tailwind `theme.extend` block:

```bash
npm install @tokenscout/transform
```

```typescript
import { transform } from "@tokenscout/transform";
import { extractTokens } from "@tokenscout/extract";

const tokens = await extractTokens("https://example.com");

// CSS custom properties
const css = transform(tokens, "css-vars") as string;
// :root {
//   --color-cornflowerblue-17rhtps: rgb(58, 122, 213);
//   --fontSize-font-size-1: 16px;
//   --spacing-step-1: 8px;
// }

// Tailwind config (uses theme.extend, won't overwrite Tailwind defaults)
const config = transform(tokens, "tailwind") as Record<string, unknown>;
// { theme: { extend: { colors: {...}, fontSize: {...}, spacing: {...} } } }

// Write to file for use in a project
import { writeFileSync } from "node:fs";
writeFileSync("design-tokens.css", css);
writeFileSync(
  "tailwind.tokens.js",
  `module.exports = ${JSON.stringify(config, null, 2)}`
);
```

---

## Typical Codex task patterns

### Clone a competitor's design system

```
/tokenscout https://competitor.com --format tailwind
```

Codex will extract the full token set and present the Tailwind `theme.extend`
block. Ask it to scaffold a Next.js project using those tokens.

### Audit a site for animation accessibility

```
/tokenscout https://example.com --quick
```

If `reducedMotion.gap` is `true`, the site has animations but no
`prefers-reduced-motion` guard (WCAG 2.3.3 gap). Codex will flag it and
can generate the missing CSS.

### Generate a CSS variable file for a redesign

```typescript
// In a Codex task
import { inspectSite } from "@tokenscout/extract";
import { transform } from "@tokenscout/transform";
import { writeFileSync } from "node:fs";

const report = await inspectSite("https://example.com");
const css = transform(report.tokens, "css-vars") as string;
writeFileSync("src/tokens.css", css);
```

### Batch-extract tokens from multiple pages

```typescript
import { extractTokens } from "@tokenscout/extract";
import { transform } from "@tokenscout/transform";

const urls = [
  "https://site-a.com",
  "https://site-b.com",
  "https://site-c.com",
];

for (const url of urls) {
  const tokens = await extractTokens(url);
  const slug = new URL(url).hostname.replace(/\./g, "-");
  const css = transform(tokens, "css-vars") as string;
  writeFileSync(`tokens/${slug}.css`, css);
}
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Cannot find module '@tokenscout/extract'` | `npm install @tokenscout/extract playwright` |
| `browserType.launch: Executable doesn't exist` | `npx playwright install chromium` |
| Bot-detection 403 | Try `--quick` first; some sites block full headless crawls |
| 0 colors returned | Site uses runtime CSS custom properties. Check `report.tokens.color.$extensions.unanalyzable` |
| Timeout | Pass `{ timeout: 60000 }` to `inspectSite`/`extractTokens` |
| `ERR_REQUIRE_ESM` | The packages are ESM only. Use `import`, not `require`. Set `"type": "module"` in your `package.json` |

---

## Updating the skill

```bash
npx skills update tokenscout
```

Or re-add to pull the latest SKILL.md from the repo:

```bash
npx skills add Atroci/tokenscout
```
