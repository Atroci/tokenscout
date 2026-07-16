English | [Português (Brasil)](./README.pt-BR.md)

# tokenscout

[![npm version](https://img.shields.io/npm/v/tokenscout.svg)](https://www.npmjs.com/package/tokenscout)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./packages/core/package.json)

TokenScout helps small web agencies turn an undocumented live client website
into an evidence-backed redesign baseline, so they can scope and start
rebuilding without guessing what the browser actually renders.

When source design files are missing, stale, or incomplete, manual discovery
creates unsupported assumptions, missed requirements, and avoidable rework.
TokenScout studies the rendered site and writes a reviewable website rebuild
evidence pack: W3C DTCG tokens, assets, motion, icons, topology, interactions,
screenshots, Design DNA, and CSS/Tailwind output.

It records what the browser presents. It does not claim to recover the original
design intent, replace design judgment, or generate a complete design system.

Three packages:

- **`tokenscout`** (core), zero runtime dependencies. You give it style
  observations from a page (colors, font sizes, spacing) and it returns a
  deduplicated, structured token document. Color clustering, type and spacing
  scale detection, WCAG contrast-pair audit, and DTCG export are all
  implemented and tested.
- **`@tokenscout/extract`**, which drives a headless browser (Playwright) to
  collect those observations from a live URL for you: computed styles at one or
  more breakpoints, optional same-origin crawling, assets, CSS motion, stack,
  icons, topology, and the primary interaction model. `studySite` writes the
  evidence and a versioned Design DNA brief to disk.
- **`@tokenscout/transform`**, which renders a DTCG token document as CSS custom
  properties or a Tailwind configuration without guessing semantic roles.

You can supply observations yourself, extract a report from a live page, or
write a complete study bundle for a redesign. Design and status in
[ARCHITECTURE.md](./ARCHITECTURE.md) and [ROADMAP.md](./ROADMAP.md).

## Why agencies use it

- **Scope from evidence.** Start a client rebuild from a reviewable baseline,
  not a subjective walkthrough of an undocumented site.
- **Computed, not source.** What ships to a user's screen is not what is in the
  stylesheet. TokenScout reduces the resolved, painted values.
- **Perceptual clustering.** `#3a7bd5`, `#3b7cd6`, and `rgb(58,123,213)` are
  three strings but one color. tokenscout clusters them in CIELAB by ΔE76, so a
  sprawling declared palette collapses to the handful of colors a site really
  uses (the example below: 9 declared to 4 real).
- **Stable, name-hinted token ids.** Color tokens are keyed by a content hash
  of the canonical value plus the nearest CSS color name (e.g.
  `cornflowerblue-17rhtps`), so ids stay put across runs and a token diff
  reflects real palette change, not list churn.
- **Zero runtime dependencies.** The color math is ~120 lines of pure
  TypeScript (sRGB→Lab, ΔE76, single-linkage union-find). No native deps.

## Install

```bash
npm install tokenscout
```

For live extraction and a reusable study bundle, install the extract package
and a browser:

```bash
npm install @tokenscout/extract playwright
npx playwright install chromium
```

To turn DTCG tokens into implementation files:

```bash
npm install @tokenscout/transform
```

ESM, Node 20+. Playwright is a peer dependency of `@tokenscout/extract`, so the
core stays dependency-free.

The relaunch versions are prepared in this repository, but distribution is not
complete yet: npm currently has `tokenscout@0.3.0`; the scoped extract and
transform packages still await their first publication. Until Phase 7 is
complete, use the workspace checkout for the full three-package workflow.

## Agent skill

The repository includes a cross-agent [`tokenscout` skill](./skills/tokenscout/SKILL.md)
for URL-to-study, DTCG, CSS-variable, and Tailwind workflows. Install it directly
from GitHub with the `skills` CLI:

```bash
npx skills add Atroci/tokenscout
```

Then ask your agent, for example:

```text
Use $tokenscout to study https://example.com and produce an evidence-backed redesign baseline.
```

The skill orchestrates the npm packages; it does not bundle Chromium or package
code. External extraction therefore requires the relaunch packages to be live
on npm. The public skill source is canonical; do not maintain a separate MCP or
command implementation.

## Use

### Study a live site

```ts
import { studySite } from "@tokenscout/extract";

await studySite("https://example.com", {
  outDir: "./tokenscout-study",
  breakpoints: [1440, 768, 390],
});
```

This writes `site-report.json`, `design-dna.json`, `design-dna.md`, and
light/dark screenshot evidence. Design DNA separates measured observations,
conservative inferences, explicit unknowns, and keep/adapt/improve/do-not-copy
guidance. The contract is versioned and documented in
[`docs/design-dna-v0.1.md`](./docs/design-dna-v0.1.md).

### From a live URL

```ts
import { extractTokens } from "@tokenscout/extract";

// Crawl + read computed styles, then reduce to a DTCG token document.
const tokens = await extractTokens("https://example.com", {
  breakpoints: [1280, 375],
  top: 1, // same-origin pages to crawl from the entry URL
});
```

`extractSite(url, opts)` is also exported if you want the raw `PageExtract[]`
before reduction.

For the full redesign bundle in one call, use `inspectSite`:

```ts
import { inspectSite } from "@tokenscout/extract";

const report = await inspectSite("https://example.com", {
  breakpoints: [1280, 375],
  top: 5,
  sitemap: true, // discover pages from sitemap.xml instead of crawling links
});

report.tokens; // DTCG document (color, fontSize, spacing, and a duration group)
report.assets; // resolved, deduplicated image/asset manifest
report.animations; // CSS durations (ms), easings, @keyframes names
report.stack; // detected frameworks with confidence
```

### Live progress

Long multi-page inspections can expose structured lifecycle updates without
changing their final Promise result or writing to stdout:

```ts
const report = await inspectSite("https://example.com", {
  breakpoints: [1440, 768, 390],
  onProgress(event) {
    const position =
      event.current === undefined ? "" : ` ${event.current}/${event.total}`;
    const viewport =
      event.breakpoint === undefined ? "" : ` @ ${event.breakpoint}px`;
    process.stderr.write(
      `[tokenscout] ${event.phase}.${event.status}${viewport}${position} ${JSON.stringify(event.detail ?? {})}\n`,
    );
  },
});
```

`extractSite`, `extractTokens`, `inspectSite`, and `captureSite` accept the same
optional `onProgress` listener. Events report real phases, statuses, page and
breakpoint counters, elapsed time, and compact result counts. Disabled
collectors emit `skipped`; failures emit `failed` before the original error is
re-thrown. Listener errors are ignored so progress presentation cannot abort a
successful scan. Listeners are synchronous; returned promises are not awaited,
although rejected thenables are observed to prevent unhandled rejections.

`inspectSite` emits rendered-style viewport progress but does not take
screenshots. Only `captureSite` emits the `screenshot` phase.

To copy the site's images for a redesign, fetch the manifest to disk:

```ts
import { downloadAssets } from "@tokenscout/extract";

await downloadAssets(report.assets, "./out/assets"); // writes files + manifest.json
```

### Export to CSS or Tailwind

```ts
import { transform } from "@tokenscout/transform";

const css = transform(report.tokens, "css-vars");
const tailwind = transform(report.tokens, "tailwind");
```

The transform deliberately stops at raw token families. It does not invent
semantic `background`, `primary`, or `border` aliases that the evidence cannot
support yet.

The individual collectors (`discoverAssets`, `extractAnimations`, `profilePage`,
`discoverSitemapUrls`) are exported too, if you want to run them on your own
`page`.

### Experimental: JS-driven motion

Best-effort, research-tier, and not part of `inspectSite`'s default output:

```ts
import { detectPageMotion, captureMotion } from "@tokenscout/extract";

const libs = await detectPageMotion(page); // GSAP / Framer / AOS / Lottie ...
// captureMotion wraps Element.animate before navigation, so call it on a fresh page:
const motion = await captureMotion(freshPage, "https://example.com");
// { count, durations (ms), easings, properties } captured from the Web Animations API
```

### From observations you already have

Feed in page observations, get a DTCG token document back:

```ts
import { assembleTokens } from "tokenscout/tokens";
import type { PageExtract } from "tokenscout/schema";

const pages: PageExtract[] = [
  {
    url: "https://example.com/",
    breakpoint: 1280,
    colors: [
      { value: "#3a7bd5", role: "background-color", count: 40 },
      { value: "#3b7cd6", role: "color", count: 5 },
      { value: "rgb(58, 123, 213)", role: "border-color", count: 2 },
      { value: "#e23744", role: "color", count: 12 },
    ],
    type: { sizes: ["16px", "20px", "25px", "31.25px"] },
    spacing: { values: ["8px", "16px", "24px", "32px"] },
  },
];

const tokens = assembleTokens(pages); // { color, fontSize, spacing }, DTCG-shaped
```

The full runnable version is in
[`packages/core/examples/quickstart.ts`](./packages/core/examples/quickstart.ts)
(`npx tsx packages/core/examples/quickstart.ts`), and its output is checked in at
[`packages/core/examples/design-tokens.json`](./packages/core/examples/design-tokens.json).

Need just the color math? Import it directly:

```ts
import { parseColor, clusterColors } from "tokenscout/color";

const colors = ["#3a7bd5", "#3b7cd6", "rgb(58, 123, 213)", "#e23744"]
  .map((value) => {
    const p = parseColor(value);
    return p ? { value, rgb: p.rgb } : null;
  })
  .filter((c) => c !== null);

const clusters = clusterColors(colors); // ΔE76 ≤ 2.5 by default
// 2 clusters: one blue (3 members, canonical "#3a7bd5"), one red.
```

Lower-level building blocks (`rgbToLab`, `deltaE76`) are exported too.

## Results

The example above, run through `assembleTokens`, collapses 9 declared colors
into 4 real ones and emits clean type and spacing scales. The `color` group
records that collapse as an auditable **sprawl metric** in group-level
`$extensions` (`9 analyzable → 4 distinct = 2.25×`), and each color token has a
stable, name-hinted id, a DTCG structured `$value`, and `$extensions` metadata
(what it was authored as, how often it was used, which CSS properties it painted,
and the raw members that clustered into it):

```json
{
  "color": {
    "$extensions": {
      "com.tokenscout.analyzable": 9,
      "com.tokenscout.unanalyzable": 0,
      "com.tokenscout.distinct": 4,
      "com.tokenscout.sprawl-ratio": 2.25
    },
    "cornflowerblue-17rhtps": {
      "$value": { "colorSpace": "srgb", "components": [0.22745, 0.48235, 0.83529], "alpha": 1 },
      "$type": "color",
      "$extensions": {
        "com.tokenscout.css-authored-as": "#3a7bd5",
        "com.tokenscout.usage-count": 50,
        "com.tokenscout.css-properties": ["background-color", "border-color", "color"],
        "com.tokenscout.member-count": 4,
        "com.tokenscout.members": ["#3A7BD4", "#3a7bd5", "#3b7cd6", "rgb(58, 123, 213)"]
      }
    }
    // ... white-0z2ixva, black-0ugpfk2, crimson-09p9vbj elided
  },
  "fontSize": {
    "font-size-1": { "$value": { "value": 16, "unit": "px" }, "$type": "dimension" },
    "font-size-2": { "$value": { "value": 20, "unit": "px" }, "$type": "dimension" }
  }
}
```

Full document: [`packages/core/examples/design-tokens.json`](./packages/core/examples/design-tokens.json).

## Use cases

- **Redesign from truth.** Capture an existing site's real palette and scales
  so a rebuild starts from what users actually see, not a guess.
- **Audit a design system's drift.** Surface how many near-duplicate colors and
  off-grid spacing values a live site has accumulated versus its intended scale.
- **Seed `design-tokens.json`.** Get a W3C DTCG starting point for Style
  Dictionary or any DTCG-aware tooling.
- **Ground an AI-assisted rebuild.** Give an agent measured evidence, explicit
  unknowns, and transfer boundaries instead of asking it to imitate a screenshot
  from memory.
- **Normalize scraped styles.** Turn raw computed-style dumps from your own
  crawler into a deduplicated, structured token set.

## Limitations

Honest about the edges, since they affect output:

- **JS-motion capture is experimental.** `@tokenscout/extract` reads
  color/type/spacing, an asset manifest (`downloadAssets` fetches it to disk),
  CSS animation tokens, and a tech-stack profile. As **experimental** extras it
  also fingerprints animation libraries (`detectPageMotion`) and captures
  Web-Animations-API motion (`captureMotion`, wrapping `Element.animate`). These
  are best-effort and not part of `inspectSite`'s default output. Still on the
  roadmap: sampling rAF-driven motion that bypasses WAAPI, downloading Lottie
  JSON, and motion-reference video.
- **Motion tokens are durations only (in the DTCG `duration` group).** Easings
  and `@keyframes` names are reported on `inspectSite`'s `animations` field but
  are not yet emitted as DTCG tokens.
- **Most common CSS Color 4 functions are parsed.** Hex, `rgb()`/`rgba()`,
  `hsl()`/`hsla()`, named colors, `oklch()`, `oklab()`, `lab()`, `lch()`, and
  `hwb()` are supported. The parameterized `color()` form is still dropped.
- **Lengths are `px` and `rem` only.** `em`, `%`, `vw`, and keywords are dropped.
- **Fully transparent paints (alpha 0) are dropped** from color tokens; alpha is
  otherwise not part of the cluster identity, so opaque and semi-transparent
  variants of the same RGB still merge.
- **Color clustering is single-linkage**, so it chains transitively: across a
  near-continuous gradient a cluster's perceptual spread can exceed the
  threshold. Lower the ΔE threshold if that matters for your input.
- **No per-breakpoint or per-theme identity.** Extracts from every breakpoint
  are flattened into one token set, so mobile/desktop differences dissolve, and
  light/dark themes are not captured separately. Both are next-focus work (see
  Roadmap).
- **Contrast pairs are a proxy, not exhaustive.** `com.tokenscout.contrast-pairs`
  cross-joins the top 3 clusters used as `background-color` against the top 3
  used as `color` — the combinations a designer would actually check, not
  every color pairing on the page. Element-level "this exact button fails
  contrast" reporting would need per-element geometry, which is out of scope
  for a computed-style/CSS-only tool (see touch-target geometry below).
- **No element-level geometry** (button/target width, height, position). Page
  topology reports section-level layout only. Fitts's-Law-style touch-target
  auditing needs per-element boxes at a given breakpoint, which belongs in a
  browser-driven layer (`@tokenscout/extract` or a consumer), not core.

## Roadmap

Three-package shape: a zero-dependency core, a Playwright extraction layer, and
a small transform layer. Full detail in
[ROADMAP.md](./ROADMAP.md); design in [ARCHITECTURE.md](./ARCHITECTURE.md).

**Core (`tokenscout`, zero deps):**
- [x] Color: parse, sRGB→Lab, ΔE76, perceptual clustering
- [x] Tests + CI
- [x] Type scale reducer
- [x] Spacing scale reducer
- [x] `design-tokens.json` (W3C DTCG) export
- [x] WCAG contrast-pair audit (background/text cross-join, 4.5:1 / 3:1 verdicts)
- [ ] Semantic role aliasing (`color.background.canvas`, `color.action.primary`,
      …, inferred from usage) — prerequisite for a `shadcn` transform target
- [ ] Radius / shadow / border / breakpoint token families

**Extract (`@tokenscout/extract`, Playwright peer):**
- [x] Live crawl + computed-style extraction at breakpoints
- [x] Image / asset harvesting and downloads
- [x] CSS animation signals, stack, icons, topology, and interaction detection
- [x] Versioned Design DNA study bundle with screenshot evidence
- [~] JavaScript motion capture (opt-in research tier; rAF remains incomplete)
- [ ] Responsive / multi-screen capture: configurable breakpoints, light/dark
      dual palette, and per-breakpoint token identity (currently flattened)

**Transform (`@tokenscout/transform`):**
- [x] CSS custom properties
- [x] Tailwind configuration
- [ ] Semantic aliases and `shadcn` export after role evidence exists

Next focus is responsive multi-screen capture and refined motion capture —
plan in [docs/next-steps-responsive-and-motion.md](./docs/next-steps-responsive-and-motion.md).

**Release:**
- [x] Core is live on npm; the registry currently trails GitHub
- [x] Public agent skill is versioned in this repository
- [ ] Install/index the skill on skills.sh after the scoped npm packages ship
- [ ] Publish the relaunch set: `tokenscout@0.5.1`,
      `@tokenscout/extract@0.5.0`, and `@tokenscout/transform@0.1.0`

## Contributing

Issues and PRs welcome, especially around color science, CSS value parsing,
token-scale heuristics, and evidence-based design transfer. The deterministic
study and transform layers are MIT-licensed with the rest of the repository.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev loop and the
zero-runtime-dependency rule, and the [Code of Conduct](./CODE_OF_CONDUCT.md)
before participating. Changes are tracked in [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE) © Hugo Carvalho
