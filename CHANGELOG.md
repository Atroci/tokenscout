# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed (tooling)

- Hardened the `Release` workflow's npm publish step: publishing is now
  idempotent (re-running a tag whose version is already on npm is a no-op
  success, not a failure), and a transient `404` from the registry during the
  post-publish availability check is treated as success rather than a failed
  release.

### Docs

- Added a responsive + motion next-steps design doc and updated `ROADMAP`:
  scopes per-breakpoint token identity (today all `PageExtract`s flatten into
  one merged token set, dissolving mobile vs desktop differences) and the
  Phase 4 motion differentiators (library detection, WAAPI timelines, Lottie
  download, scroll-driven capture, motion-reference video). Docs only — no
  package code change yet. (Note: the private parent `web-forensics` pipeline's
  "CSS-only animation, no JS anim libs" decision is its own boundary and does
  not constrain tokenscout's roadmap.)

## [0.3.0]

### Added

- Color parsing now covers `hsl()`/`hsla()` (comma and space syntax, optional
  alpha) and the full set of CSS named colors (`transparent` → alpha 0). Hex and
  `rgb()`/`rgba()` behavior is unchanged; `oklch()`, `lab()`/`lch()`, `hwb()`,
  and `color()` still return `null`.
- Color tokens now emit a DTCG structured `$value`
  (`{ colorSpace: "srgb", components: [r, g, b], alpha }`) instead of a raw
  string, with a `ColorValue` type added to `schema.ts`.
- Color tokens carry `$extensions` metadata: `com.tokenscout.css-authored-as`
  (the canonical authored value), `usage-count` (summed cluster count),
  `css-properties` (sorted roles the color painted), `member-count`, and
  `members` (the raw values that clustered together).
- Stable, name-hinted color token ids: keys are now
  `${nearestName}-${hash}` (e.g. `cornflowerblue-17rhtps`) via `stableColorId`
  + `nearestNamedColor`, replacing the positional `color-N` keys so ids stay put
  across runs and reordering. `Cluster` gains a `cssProperties` field and
  `ColorInput` an optional `role`.
- The `color` group carries sprawl audit metrics in group-level `$extensions`:
  `com.tokenscout.analyzable` (distinct parseable strings), `unanalyzable`
  (strings dropped, measured against tokenscout's own parser coverage),
  `distinct` (perceptual clusters), and `sprawl-ratio` (`analyzable / distinct`;
  `>1` signals near-duplicate redundancy). `TokenGroup` now allows a group-level
  `$extensions`; per DTCG, `$`-prefixed members are metadata, not tokens.
- `@tokenscout/extract` experimental (research-tier) motion capture, not part of
  `inspectSite`'s default output:
  - `detectPageMotion` / `detectMotion`: fingerprint animation libraries (GSAP,
    Framer Motion, AOS, anime.js, Velocity, ScrollMagic, Lottie), collect Lottie
    source URLs, and scrape declarative `data-aos` configs.
  - `captureMotion` / `reduceWaapiTimelines`: a pre-load hook wraps
    `Element.animate` to record Web-Animations-API motion (durations in ms,
    easings, animated properties) regardless of which library produced it.

## [0.2.0] - 2026-06-04

The live-site extraction layer plus motion tokens. Core stays zero-dependency;
all browser work lives in the new `@tokenscout/extract` package.

### Added

- `schema.ts`: the shared boundary contract (`PageExtract`, `DesignTokens`
  DTCG types, color/type/spacing observation types).
- `tokenscout/type`, `reduceTypeScale`: parse px/rem → sorted, de-duplicated
  scale + modular-ratio detection.
- `tokenscout/spacing`, `reduceSpacingScale`: parse → GCD base-grid detection
  → quantized scale.
- `tokenscout/tokens`, `assembleTokens`: clustered colors + type/spacing
  scales → a W3C DTCG token object.
- Brazilian-Portuguese README (`README.pt-BR.md`) + language switcher.
- `examples/quickstart.ts` plus its checked-in output `examples/design-tokens.json`,
  a runnable end-to-end demo of `assembleTokens`.
- `Release` GitHub Actions workflow: publishes to npm with provenance on a `v*`
  tag, and `publishConfig.access: public` in `package.json`.
- **`@tokenscout/extract`** (new package): `extractSite` drives headless Chromium
  (Playwright peer dependency) to read computed styles at one or more
  breakpoints, with optional same-origin crawling, and returns `PageExtract[]`.
  `extractTokens` chains that straight into `assembleTokens`. Aggregation lives
  in a pure `harvest` function with unit tests; a browser smoke test runs against
  a local fixture in CI.
- `@tokenscout/extract` extraction modules, each a pure unit-tested core plus a
  thin browser/IO layer:
  - `discoverAssets` / `buildAssetManifest`: harvest images, backgrounds, video
    posters, favicons, and the OG image into a resolved, deduplicated manifest.
  - `extractAnimations` / `reduceAnimationTokens`: CSS animation tokens
    (durations in ms, easings, `@keyframes` names).
  - `profilePage` / `profileStack`: tech-stack fingerprinting (Next, React, Vue,
    Nuxt, Angular, Svelte, WordPress, Shopify, Gatsby) with confidence.
  - `discoverSitemapUrls` / `parseSitemap`: sitemap and sitemap-index discovery
    over `fetch`, fail-soft.
- `inspectSite`: a single-pass inspection that composes everything into one
  `SiteReport` (tokens, asset manifest, animation tokens, stack profile), with a
  `sitemap` discovery option and per-collector toggles.
- `assembleTokens` accepts an `animations` option and emits a DTCG `duration`
  group (milliseconds). `schema.ts` gains `DurationValue` and `AnimationInput`,
  and `DesignToken.$type` now includes `"duration"`.
- `downloadAssets` / `assetFilename`: fetch a harvested asset manifest to disk
  (safe, deduplicated filenames) and write a `manifest.json`, fail-soft per
  asset.

### Changed

- Repo restructured into npm workspaces: the published core moved to
  `packages/core` (name still `tokenscout`, no consumer breakage) and the new
  extractor to `packages/extract`. The root is a private workspace. CI now runs
  a fast core job and a separate Chromium-backed extract job.
- `ARCHITECTURE.md` rewritten to match the real two-package layout, and its
  boundary-type excerpt matches `schema.ts` (`PageExtract` carries
  `type`/`spacing` objects, not flat string arrays).

### Fixed

- `parseLength` now rejects lengths whose digit run overflows to a non-finite
  number. A crafted value (e.g. a 400-digit `px`) previously reached
  `reduceSpacingScale`, where `gcd` looped forever on `Infinity` (an unbounded
  hang reachable from `assembleTokens`). `gcd` also guards non-finite operands.
- `assembleTokens` no longer lets a fully transparent paint (`alpha 0`) win as a
  cluster's canonical color, which could emit a transparent value as a primary
  color token.

## [0.1.0] - 2026-06-04

First open-core release: the zero-dependency color layer, tested and CI-gated.

### Added

- Zero-dependency TypeScript design-token toolkit (ESM, Node 20+).
- Color module (`tokenscout/color`): CSS color parsing (`parseColor`, hex
  3/4/6/8 + `rgb()`/`rgba()` with gamut clamping), sRGB→CIELAB conversion
  (`rgbToLab`), ΔE76 distance (`deltaE76`), and perceptual color clustering via
  single-linkage union-find (`clusterColors`).
- Type-resolving package `exports` (`.` and `./color`), `sideEffects: false`,
  and a `prepack` build guard for safe publishing.
- Tooling: ESLint + Prettier, a 12-case `node:test` suite, GitHub Actions CI
  (lint → typecheck → build → test → prod-dep audit).
- Project docs: `README`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`,
  `ROADMAP`, `ARCHITECTURE`, issue/PR templates.

[Unreleased]: https://github.com/Atroci/tokenscout/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Atroci/tokenscout/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Atroci/tokenscout/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Atroci/tokenscout/releases/tag/v0.1.0
