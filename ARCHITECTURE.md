# tokenscout architecture

## Invariant

The `tokenscout` core package carries no runtime dependencies: there is no
`dependencies` key in `package.json` and the source imports no browser.
Everything that touches Chrome will live in a separate package. That keeps
`npm i tokenscout` actually dependency-free.

## Layout

Two packages in an npm workspace. The published core never depends on a browser.

```
tokenscout/                        repo root (private workspace; not published)
├─ package.json                    { "private": true, "workspaces": ["packages/*"] }
├─ tsconfig.base.json
└─ packages/
   ├─ core/                        →  published as  "tokenscout"   zero runtime deps
   │  └─ src/
   │     ├─ index.ts               public entry, re-exports the subpaths
   │     ├─ schema.ts              contract types (PageExtract, DesignTokens, …)
   │     ├─ length.ts              px/rem length parsing, shared by the reducers
   │     ├─ color/                 lab · parse · cluster · contrast (WCAG ratio)
   │     ├─ type/                  type-scale reducer
   │     ├─ spacing/               spacing-scale reducer
   │     └─ tokens/                assemble → design-tokens.json (W3C DTCG)
   └─ extract/                     →  published as  "@tokenscout/extract"
      └─ src/
         ├─ index.ts               extractSite / extractTokens
         ├─ crawl.ts               same-origin link discovery
         ├─ extract-page.ts        getComputedStyle @ breakpoints
         └─ harvest.ts             raw observations → PageExtract (pure)
```

Still on the roadmap inside extract: image/asset harvesting and animation
capture (CSS tokens, Lottie, library detection, screencast, Tier-3 WAAPI/rAF
instrumentation). See [ROADMAP.md](./ROADMAP.md).

The published core name is `tokenscout`. Browser weight lives only in
`@tokenscout/extract`, with Playwright as a peer dependency.

## Dependency direction

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
canonical definition is
[`packages/core/src/schema.ts`](./packages/core/src/schema.ts); the excerpt
below must match it.

```ts
// packages/core/src/schema.ts
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

Flow:

```ts
import { extractSite } from "@tokenscout/extract";   // drives Playwright
import { assembleTokens } from "tokenscout/tokens";   // pure, zero-dep

const pages: PageExtract[] = await extractSite("https://example.com", { top: 5 });
const tokens: DesignTokens = assembleTokens(pages);   // clusterColors() etc. run here
```

`@tokenscout/extract` also exposes `extractTokens`, which does both steps in one
call. You can still build `PageExtract[]` by hand (or from your own extractor)
and call `assembleTokens` directly, with no browser involved.

## CI

Two jobs (`.github/workflows/ci.yml`):

- **core**: `lint → build → typecheck → test` plus a production-dependency
  audit, no browser. Fast; runs on every push and PR.
- **extract**: installs Chromium (`npx playwright install --with-deps chromium`),
  builds core then extract, and runs the smoke extraction against a local
  fixture. Slower, and isolated so it never slows the core's hot path.

## Open decisions

- **npm scope** for `@tokenscout/extract` (create the `tokenscout` npm org on
  publish) versus unscoped `tokenscout-extract`.
- Whether Tier-3 animation instrumentation graduates from research into a
  supported feature, or stays an opt-in experimental export.
