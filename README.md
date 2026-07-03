English | [Português (Brasil)](./README.pt-BR.md)

# tokenscout

[![npm version](https://img.shields.io/npm/v/tokenscout.svg)](https://www.npmjs.com/package/tokenscout)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)

Reduce a website's real, rendered styles to a clean design-token set: a
perceptually-deduplicated color palette, a type scale, and a spacing scale,
exported as a W3C DTCG `design-tokens.json`.

Most design-token tooling starts from source CSS or a design file. tokenscout
works on computed styles, the values a browser actually paints, so cascades,
overrides, third-party widgets, and runtime theming are all already resolved.

Two packages:

- **`tokenscout`** (core), zero runtime dependencies. You give it style
  observations from a page (colors, font sizes, spacing) and it returns a
  deduplicated, structured token document. Color clustering, type and spacing
  scale detection, and DTCG export are all implemented and tested.
- **`@tokenscout/extract`**, which drives a headless browser (Playwright) to
  collect those observations from a live URL for you: computed styles at one or
  more breakpoints, with optional same-origin crawling. Image-asset harvesting
  and animation capture are still on the roadmap.

So you can either supply observations yourself (your own crawler, or by hand) or
let `@tokenscout/extract` read them off a live page. Design and status in
[ARCHITECTURE.md](./ARCHITECTURE.md) and [ROADMAP.md](./ROADMAP.md).

## Why

- **Computed, not source.** What ships to a user's screen is not what is in the
  stylesheet. tokenscout reduces the resolved, painted values.
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

For live extraction, also install the extract package and a browser:

```bash
npm install @tokenscout/extract playwright
npx playwright install chromium
```

ESM, Node 20+. Playwright is a peer dependency of `@tokenscout/extract`, so the
core stays dependency-free.

## Use

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

To copy the site's images for a redesign, fetch the manifest to disk:

```ts
import { downloadAssets } from "@tokenscout/extract";

await downloadAssets(report.assets, "./out/assets"); // writes files + manifest.json
```

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
- **Color input is hex, `rgb()`/`rgba()`, `hsl()`/`hsla()`, and CSS named
  colors.** `oklch()`, `lab()`/`lch()`, `hwb()`, and `color()` are not parsed
  yet and are dropped.
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

## Roadmap

Two-package shape: a zero-dependency core (pure token math) and an extract
package that drives a headless browser. Full detail in
[ROADMAP.md](./ROADMAP.md); design in [ARCHITECTURE.md](./ARCHITECTURE.md).

**Core (`tokenscout`, zero deps):**
- [x] Color: parse, sRGB→Lab, ΔE76, perceptual clustering
- [x] Tests + CI
- [x] Type scale reducer
- [x] Spacing scale reducer
- [x] `design-tokens.json` (W3C DTCG) export

**Extract (`@tokenscout/extract`, Playwright peer):**
- [x] Live crawl + computed-style extraction at breakpoints
- [ ] Image / asset harvesting (manifest + files, for redesign migration)
- [ ] Animation capture: CSS `@keyframes`/transition tokens + Lottie download
      + library detection + motion-reference video, up to runtime WAAPI/rAF
      instrumentation of JS-driven motion (research tier)
- [ ] Responsive / multi-screen capture: configurable breakpoints, light/dark
      dual palette, and per-breakpoint token identity (currently flattened)

Next focus is responsive multi-screen capture and refined motion capture —
plan in [docs/next-steps-responsive-and-motion.md](./docs/next-steps-responsive-and-motion.md).

**Release:**
- [x] Publish core to npm (`0.1.x`), live: https://www.npmjs.com/package/tokenscout

## Contributing

Issues and PRs welcome, especially around color science, CSS value parsing,
and token-scale heuristics. This is an open-core project; the synthesis and
reporting layers on top of it are separate.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev loop and the
zero-runtime-dependency rule, and the [Code of Conduct](./CODE_OF_CONDUCT.md)
before participating. Changes are tracked in [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE) © Hugo Carvalho
