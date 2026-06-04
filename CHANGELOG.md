# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Changed

- Repo restructured into npm workspaces: the published core moved to
  `packages/core` (name still `tokenscout`, no consumer breakage) and the new
  extractor to `packages/extract`. The root is a private workspace. CI now runs
  a fast core job and a separate Chromium-backed extract job.

### Fixed

- `parseLength` now rejects lengths whose digit run overflows to a non-finite
  number. A crafted value (e.g. a 400-digit `px`) previously reached
  `reduceSpacingScale`, where `gcd` looped forever on `Infinity` (an unbounded
  hang reachable from `assembleTokens`). `gcd` also guards non-finite operands.
- `assembleTokens` no longer lets a fully transparent paint (`alpha 0`) win as a
  cluster's canonical color, which could emit a transparent value as a primary
  color token.

### Changed

- `ARCHITECTURE.md` now distinguishes the current single-package layout from the
  planned core/extract workspace split, and its boundary-type excerpt matches
  `src/schema.ts` (`PageExtract` carries `type`/`spacing` objects, not flat
  string arrays).

Next (see [ROADMAP.md](./ROADMAP.md)): the live-site `@tokenscout/extract`
package, covering computed-style extraction, asset harvesting, and animation
capture.

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

[Unreleased]: https://github.com/Atroci/tokenscout/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Atroci/tokenscout/releases/tag/v0.1.0
