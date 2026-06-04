# tokenscout — architecture

## Invariant

**The published `tokenscout` (core) package has an empty `dependencies` map and
imports no browser.** Everything that touches Chrome lives in a separate package.
This keeps `npm i tokenscout` genuinely dependency-free rather than
"zero-dep with an asterisk."

## Two packages (npm workspaces)

```
tokenscout/                        repo root (private workspace; not published)
├─ package.json                    { "private": true, "workspaces": ["packages/*"] }
├─ tsconfig.base.json
└─ packages/
   ├─ core/                        →  published as  "tokenscout"   ★ ZERO runtime deps
   │  └─ src/
   │     ├─ index.ts
   │     ├─ schema.ts              contract types (PageExtract, DesignTokens…)
   │     ├─ color/                 lab · parse · cluster   (shipped in 0.1.0)
   │     ├─ type/                  type-scale reducer
   │     ├─ spacing/               spacing-scale reducer
   │     └─ tokens/                assemble → design-tokens.json (W3C DTCG)
   └─ extract/                     →  published as  "@tokenscout/extract"
      └─ src/
         ├─ index.ts
         ├─ crawl.ts               sitemap / link discovery
         ├─ profile-stack.ts       tech fingerprint
         ├─ extract-page.ts        getComputedStyle @ breakpoints
         ├─ harvest-assets.ts      image/asset download + manifest
         └─ animations.ts          CSS tokens · Lottie · library detect ·
                                   screencast · WAAPI/rAF instrumentation (Tier 3)
```

> The current single-package layout migrates by moving `src/` →
> `packages/core/src/`. The published name stays `tokenscout`, so there is no
> consumer breakage.

## Dependency direction

```
@tokenscout/extract  ──depends on──▶  tokenscout (core)        one-directional
        │
        └──peerDependency──▶  playwright   (consumer installs it + browsers)

core knows NOTHING about Playwright — pure functions over plain data.
```

- `npm i tokenscout` → pulls nothing.
- `npm i @tokenscout/extract playwright && npx playwright install chromium` →
  extraction. Playwright is a **peer** so the consumer owns its version and the
  browser-binary install — the standard pattern for browser-driving tools.

## The boundary type (the seam)

Defined in core, produced by extract, consumed by core's reducers. Both sides
share one typed shape; neither reaches across it beyond these types.

```ts
// packages/core/src/schema.ts
export interface ColorObservation { value: string; role: string; count: number } // role = CSS property
export interface PageExtract {
  url: string;
  breakpoint: number;                 // viewport width in px
  colors: ColorObservation[];
  fontSizes: string[];
  spacing: string[];
  // …extended per layer (animations, assets manifest, …)
}
export interface DesignTokens { /* DTCG-shaped output */ }
```

Flow:

```ts
import { extractSite } from "@tokenscout/extract";   // drives Playwright
import { assembleTokens } from "tokenscout/tokens";   // pure, zero-dep

const pages: PageExtract[] = await extractSite("https://example.com", { top: 5 });
const tokens: DesignTokens = assembleTokens(pages);   // clusterColors() etc. run here
```

## CI

- **core** — `lint → typecheck → build → test`, no browser. Fast; runs on every
  push (current workflow, scoped to `packages/core`).
- **extract** — installs Chromium (`npx playwright install --with-deps chromium`)
  and runs a smoke extraction against a local fixture. Slower; isolated so it
  never slows the core's hot path.

## Open decisions

- **npm scope** for `@tokenscout/extract` (create the `tokenscout` npm org on
  publish) vs unscoped `tokenscout-extract`.
- Whether Tier-3 animation instrumentation graduates from research into a
  supported feature, or stays an opt-in experimental export.
