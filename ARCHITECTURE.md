# tokenscout architecture

## Invariant

The `tokenscout` core package carries no runtime dependencies: there is no
`dependencies` key in `package.json` and the source imports no browser.
Everything that touches Chrome will live in a separate package. That keeps
`npm i tokenscout` actually dependency-free.

## Current layout (what ships today)

tokenscout is a single zero-dependency package. v0.1.x publishes the core token
math; the browser-driving extraction layer is not built yet (see
[ROADMAP.md](./ROADMAP.md)).

```
tokenscout/
└─ src/
   ├─ index.ts                 public entry, re-exports the subpaths
   ├─ schema.ts                contract types (PageExtract, DesignTokens, …)
   ├─ length.ts                px/rem length parsing, shared by the reducers
   ├─ color/                   lab · parse · cluster   (shipped in 0.1.0)
   ├─ type/                    type-scale reducer
   ├─ spacing/                 spacing-scale reducer
   └─ tokens/                  assemble → design-tokens.json (W3C DTCG)
```

## Planned package split (not yet on disk)

The design intent is to split into two packages so the browser dependency never
reaches core consumers. This migration has not happened yet; the tree below is
the target, not the current state.

```
tokenscout/                        repo root (private workspace; not published)
├─ package.json                    { "private": true, "workspaces": ["packages/*"] }
├─ tsconfig.base.json
└─ packages/
   ├─ core/                        →  published as  "tokenscout"   zero runtime deps
   │  └─ src/                      (the current src/ moves here unchanged)
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

The published name stays `tokenscout`, so the split causes no consumer breakage.

## Dependency direction

Once the split lands, the dependency arrow is one-directional:

```
@tokenscout/extract  ──depends on──▶  tokenscout (core)
        │
        └──peerDependency──▶  playwright   (consumer installs it + browsers)

core knows NOTHING about Playwright: pure functions over plain data.
```

- `npm i tokenscout` → pulls nothing.
- `npm i @tokenscout/extract playwright && npx playwright install chromium` →
  extraction. Playwright is a peer dependency, so the consumer owns its version
  and the browser-binary install. This is the standard pattern for
  browser-driving tools.

## The boundary type (the seam)

Defined in core, produced by extract, consumed by core's reducers. Both sides
share one typed shape; neither reaches across it beyond these types. The
canonical definition is [`src/schema.ts`](./src/schema.ts); the excerpt below
must match it.

```ts
// src/schema.ts
export interface ColorObservation {
  value: string;   // verbatim CSS color (hex / rgb() / rgba())
  role: string;    // CSS property it was painted from, e.g. "background-color"
  count: number;   // occurrence weight across the rendered DOM
}
export interface TypeObservation { sizes: string[] }     // font-size values
export interface SpacingObservation { values: string[] } // margin/padding/gap values

export interface PageExtract {
  url: string;
  breakpoint: number;            // viewport width in px
  colors: ColorObservation[];
  type: TypeObservation;
  spacing: SpacingObservation;
}

// The assembled output is a recursive W3C DTCG token group.
export type DesignTokens = TokenGroup;
```

Flow (the `extractSite` half is the planned API; only `assembleTokens` exists today):

```ts
import { extractSite } from "@tokenscout/extract";   // planned: drives Playwright
import { assembleTokens } from "tokenscout/tokens";   // shipped: pure, zero-dep

const pages: PageExtract[] = await extractSite("https://example.com", { top: 5 });
const tokens: DesignTokens = assembleTokens(pages);   // clusterColors() etc. run here
```

Today you build `PageExtract[]` by hand (or from your own extractor) and call
`assembleTokens` directly.

## CI

- **Current**: a single-package pipeline, `lint → typecheck → build → test`, no
  browser. Fast; runs on every push.
- **Planned (after the split)**: the same fast core pipeline scoped to
  `packages/core`, plus a separate, slower `extract` job that installs Chromium
  (`npx playwright install --with-deps chromium`) and runs a smoke extraction
  against a local fixture. Isolating it keeps the browser install off the core's
  hot path.

## Open decisions

- **npm scope** for `@tokenscout/extract` (create the `tokenscout` npm org on
  publish) versus unscoped `tokenscout-extract`.
- Whether Tier-3 animation instrumentation graduates from research into a
  supported feature, or stays an opt-in experimental export.
