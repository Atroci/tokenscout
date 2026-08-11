# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Unified release target: `tokenscout` **0.6.0** · `@tokenscout/extract`
**0.6.0** · `@tokenscout/transform` **0.6.0**. Minor bump: the ΔE2000 +
leader-clustering change alters cluster output on near-neutral and
gradient-heavy palettes.

### Added

- `tokenscout/color`: `deltaE2000` — CIEDE2000 color difference (Sharma, Wu &
  Dalal 2005), validated against the published reference pairs. `deltaE76`
  remains exported.
- `Cluster.pageCount` + per-token `$extensions["com.tokenscout.page-count"]`:
  distinct pages a color cluster was observed on. Separates site-wide chrome
  (nav/footer colors on every crawled page inflate `usage-count`) from
  one-page accents without changing the ranking.
- `@tokenscout/extract`: `studySite()` writes a stable redesign-study bundle:
  measured `site-report.json`, versioned `design-dna.json`, readable
  `design-dna.md`, and optional light/dark screenshot evidence. Design DNA keeps
  observed, inferred, and unknown claims separate, then classifies transfer
  guidance as keep, adapt, improve, or do not copy.
- `@tokenscout/extract`: optional structured `onProgress` lifecycle events for
  `extractSite`, `extractTokens`, `inspectSite`, and `captureSite`. Events expose
  truthful discovery, viewport, collector, token-reduction, and screenshot
  milestones without changing Promise results or writing to stdout. Disabled
  collectors emit `skipped`; listener errors never abort the underlying run.
- `@tokenscout/extract`: `assertPublicHttpUrl` / `isBlockedAddress` SSRF guard,
  applied before every network-reaching call — page navigation (`crawl.ts`,
  `extract-page.ts`, the `inspectSite` extras pass), sitemap fetches, and asset
  downloads. Loopback, private (RFC 1918), link-local (including the
  169.254.169.254 cloud-metadata address), carrier-grade-NAT, and other
  non-public IPv4/IPv6 targets are rejected as `UnsafeUrlError`, including
  IPv4-mapped IPv6 and DNS results, not just the literal hostname. A blocked
  sitemap or asset URL fails soft, matching those functions' existing
  fetch-error contract; a blocked navigation target throws. Non-http(s)
  schemes (`file:`, used by this repo's own fixture tests) pass through
  unchecked. Closes the gap between the `tokenscout` skill's documented
  "validate http(s) only" guardrail and what the library itself enforced.
  Modeled on ion-design/ditto.site's `assertPublicUrl` guard for its hosted
  clone endpoint, reimplemented for this package's several independent
  network call sites; see SECURITY.md for the threat model and known
  redirect-time (TOCTOU) limitation.
- New `@tokenscout/transform` package renders DTCG tokens as CSS custom
  properties or a Tailwind configuration. Semantic role and `shadcn` mappings
  remain intentionally unsupported until source evidence can justify them.
- Package-specific READMEs so every npm package has an installable quick start.
- A public, cross-agent `tokenscout` skill for live-site study, DTCG extraction,
  and evidence-preserving CSS/Tailwind export. The repository copy is canonical
  and replaces the earlier machine-local workflow that referenced an
  unpublished MCP package and the wrong `fontSize` report key.

### Changed

- **Color clustering metric and linkage.** `clusterColors` now measures ΔE2000
  (was ΔE76) and groups by count-ordered nearest-leader assignment (was
  single-linkage union-find). `DEFAULT_DELTA_E` is `2.0` (was `2.5`), matching
  the PLAN's ΔE2000 ≤ 2 target. Every cluster member is now within the
  threshold of its canonical color — the documented single-linkage transitive-
  chaining caveat (unbounded cluster spread on near-continuous gradients) is
  gone. Cluster output can differ from 0.5.x on near-neutral and gradient-heavy
  palettes; the quickstart example reduces identically.
- Regenerated `packages/core/examples/design-tokens.json`, which had drifted
  from the quickstart's real output (it predated `contrast-pairs`).
- Public positioning now leads with one buyer and job: small web agencies use
  TokenScout to turn undocumented live client websites into evidence-backed
  redesign baselines. Design-token extraction and Design DNA remain proof and
  implementation details, not the headline promise.
- Consolidated npm publishing into the GitHub Release-triggered Trusted
  Publishing workflow and added the transform package. The obsolete tag-triggered
  `NPM_TOKEN` workflow was removed.
- Documented the current npm distribution boundary and deferred skills.sh
  indexing until the two scoped packages have been published.
- Unified all three public package versions at `0.5.1`, then bumped to
  `0.6.0` for the clustering behavior change; internal core dependency range
  aligned to `^0.6.0`.

## [0.5.0] — 2026-07-05

`tokenscout` (core) **0.5.0** · `@tokenscout/extract` **0.4.0**.

### Added

- `tokenscout/color`: `relativeLuminance`, `contrastRatio`, `wcagVerdict` — WCAG 2.2 SC 1.4.3 contrast math (the exact WCAG linearization threshold, not the sRGB-EOTF one `rgbToLab` uses, so ratios agree with checkers like WebAIM's).
- Color group `$extensions["com.tokenscout.contrast-pairs"]`: cross-joins the top 3 clusters used as `background-color` against the top 3 used as `color`, each with a computed ratio and pass/fail verdict at 4.5:1 (normal text) / 3:1 (large text).
- Token assembly now emits `fontFamily`, `fontWeight`, and `lineHeight` DTCG groups — the typography identity (`AssembleOptions`, `assembleTokens`) previously reported only `fontSize`, `color`, `spacing`, and `duration`. New `tokenscout/type` reducers: `reduceFontFamilies`, `reduceFontWeights`, `reduceLineHeights`.
- `SiteReport.interaction`: page-level interaction driver (`static`/`scroll-driven`/`click-driven`/`hover-driven`/`time-driven`), composed into `inspectSite()` via the existing `detectInteractionModel` (previously exported but never called by the default pipeline). New `interaction` option, defaults to `true`.

### Fixed

- Stack profiler (`profileStack`) reported an empty `frameworks` array on every Next.js **App Router** site — its only markers (`window.__NEXT_DATA__`, `#__next`) are Pages-Router-only. Added a `/_next/static/` script-src signal, which both routers emit.
- Stack profiler now also fingerprints CSS Modules (`Button_root__a1B2c` / `_button_1a2b3_1` hashed class patterns) as a medium-confidence signal, for React/bundler stacks that trip no other framework marker.
- `extractPage()` read computed styles immediately after `load`, so reveal-on-scroll and lazy-mounted content (hero sections, carousels) never rendered and its sizes/colors/spacing were silently dropped. Now scrolls through and settles first (reusing `captureSite`'s existing scroll-and-settle pass) before sampling.
- `mapPageTopology` collapsed to one giant section on "zone-div" sites that wrap the whole page in a single hydration-root/app-shell div. Now descends through single-child wrapper divs (bounded to 5 levels) until real sibling sections appear.
- `extractSVGIcons` left icon-button SVGs unlabeled when `aria-label`/`title` sat on the wrapping `<button>`/`<a>` rather than the `<svg>` itself (the common pattern) — now falls back to the closest labeled interactive ancestor.

## [0.3.0] — 2026-06-25

`tokenscout` (core) **0.4.1** · `@tokenscout/extract` **0.3.0**. First npm publish of both packages (core was previously tagged but unpublished; extract is new).

### Added

- `@tokenscout/extract` `captureMotion` now triggers **interaction-driven
  motion**. After the load + auto-scroll passes it hovers a bounded sample of
  interactive elements (`a`, `button`, `[role=button]`, `img`, Framer markers,
  and anything with `cursor: pointer`) with the real Playwright pointer, so
  gesture animations (`whileHover` and friends) fire and the WAAPI hook records
  them. Load + scroll alone never fired these, so hover effects — e.g. a hero
  image that scales/brightens on hover — were silently missed. New options:
  `interact` (default `true`) and `maxInteractTargets` (default `24`). Synthetic
  pointer events are deliberately not used: libraries such as Framer Motion gate
  on `event.isTrusted`, so only a real pointer triggers them.
- `harvestStyles(page, selector?, depth?)` — full `getComputedStyle()` DOM tree
  walk (40 properties, depth-4 by default) that returns a `StyleNode` tree
  mirroring the element hierarchy. The keystone for component-spec generation:
  feeds exact computed values instead of aggregate token signals.
- `extractSVGIcons(page)` — collects all inline `<svg>` elements, deduplicates
  by content hash (djb2, 8-char base36), and returns a `SvgIconManifest`. Each
  `SvgIcon` carries `viewBox`, dimensions, semantic label, interactivity flag,
  and occurrence count.
- `extractContent(page, opts?)` — verbatim text nodes, `alt` attributes,
  `aria-label` values, and `placeholder` strings from a page or scoped section.
- `mapPageTopology(page)` — section inventory of the page's top-level layout
  children: tag, role, CSS position, z-index, sticky/fixed flags, height, and
  whether the section is full-screen. Returns `PageTopology` including a
  `hasScrollSnap` flag.
- `captureScrollState` / `captureClickState` / `diffStates` — snapshot computed
  styles on an element before and after a scroll or click trigger, then diff
  them to a `StateDiff` array of `{ property, before, after }`. Fills the
  interaction-state gap that static single-pass extraction misses.
- `detectInteractionModel(page, selector)` — classifies a section or element as
  `static`, `scroll-driven`, `click-driven`, `hover-driven`, or `time-driven`,
  with confidence and mechanism evidence. Prevents the #1 cloner mistake:
  building click-based UI when the original is scroll-driven.
- `diffBreakpoints(page, url, selectors, opts?)` — for each selector, captures
  layout-property snapshots at multiple viewport widths (default 1440/768/390)
  and diffs them into `LayoutChange[]` entries: property, breakpoint where the
  change first appears, before/after values.
- `detect-motion`: `RawMotionSignals` and `MotionReport` now include
  `scrollLibraries` (Lenis, Locomotive Scroll detected via window globals and
  DOM class markers) and `hasScrollSnap` (from `scroll-snap-type` on `<html>`
  or `<body>`).
- `harvest-assets`: `AssetRef` now carries five optional layered-composition
  fields for `image`-kind entries: `position`, `zIndex`, `siblingImgCount`,
  `positionedAncestorSelector`, and `isOverlay`. Flags stacked images (a
  background watermark + a foreground UI mockup in the same container) that
  otherwise appear as a single asset.
- `SiteReport` (from `inspectSite`) now includes `icons: SvgIconManifest` and
  `topology: PageTopology | null`. Both are opt-out via `InspectOptions`.

### Changed

- Baked point-wise `linear(…)` easings (Framer Motion / Motion One resolve
  springs and custom curves into a ~60-stop `linear()` at runtime) now normalize
  to a single `linear()` token in both the CSS and WAAPI reducers, instead of
  flooding the easings list with unreadable, never-deduplicated point strings.

## [0.4.0] — 2026-06-13

`tokenscout` (core) **0.4.0** · `@tokenscout/extract` **0.2.0**. Released on GitHub; npm publish pending account auth (registry still has `tokenscout@0.3.0`).

### Added

- Color parsing now covers the CSS Color 4 function forms `oklch()`, `oklab()`,
  `lab()`, `lch()`, and `hwb()` (converted to sRGB; `oklch()` is the Tailwind v4
  default space). Components accept numbers or percentages, an optional `/ alpha`,
  `none` channels, and angles in deg/grad/rad/turn; out-of-sRGB-gamut results are
  clamped per channel (full gamut mapping is deferred). Previously these returned
  `null` and the colors were silently dropped from the token set. `color()` — the
  parameterized multi-colorspace form — is still unsupported and returns `null`.
- Animation tokens now classify every animated property by render cost
  (`AnimationTokens.properties`: `composited` / `paint` / `layout`), following
  the web.dev high-performance-animation taxonomy. Compositor-only properties
  (`transform`, `opacity`, `filter`, …) are cheap; animating paint properties
  (`color`, `box-shadow`, …) forces a repaint, and animating layout properties
  (`width`, `top`, `margin`, …) forces a reflow every frame — the latter two are
  performance smells. Property names are read from `transition-property` and from
  the steps of `@keyframes` that an element actually applies (unused keyframes
  are ignored); they are lower-cased, vendor-prefix-stripped, and de-duplicated.
  This is analysis Project Wallace's CSS analyzer does not perform.
- Animation tokens now report reduced-motion accessibility coverage
  (`AnimationTokens.reducedMotion`: `{ declared, gap }`). `declared` is true when
  the page declares a `@media (prefers-reduced-motion: ...)` guard in any
  reachable stylesheet (WCAG 2.3.3, sufficient technique C39); `gap` is true when
  the page animates but declares no such guard. It is a coverage signal, not a
  hard conformance verdict — a declared guard is not proof every animation backs
  off (behavioral confirmation under emulated reduced-motion is a later step).
- Runtime motion capture via the Web Animations API (`extractRuntimeMotion`):
  snapshots every live animation from `document.getAnimations()` — including
  JS-driven / WAAPI (`element.animate()`) motion that never appears as a CSS
  transition/animation longhand — with each animation's animated properties,
  duration, and play state, and an aggregate compositor/paint/layout
  classification reusing the same performance-smell taxonomy.
- Minimal "rendering input for analysis" capture worker (`captureSite`): drives
  Playwright in-process (one recycled browser context per URL × theme) to write a
  full-page screenshot plus a runtime-motion snapshot for light and dark
  (`prefers-color-scheme`) states to a plain filesystem directory, with a
  `capture.json` manifest. Scrolls through reveal-on-scroll / lazy content and
  settles before the screenshot (`scroll` / `settleMs` options) so
  IntersectionObserver-driven pages don't capture blank. Docker-safe launch
  (`--disable-dev-shm-usage`); no external browser service, queue, or object
  storage (each deferred behind a concrete trigger).

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

[Unreleased]: https://github.com/Atroci/tokenscout/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Atroci/tokenscout/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/Atroci/tokenscout/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Atroci/tokenscout/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Atroci/tokenscout/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Atroci/tokenscout/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Atroci/tokenscout/releases/tag/v0.1.0
