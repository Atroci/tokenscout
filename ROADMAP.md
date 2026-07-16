# tokenscout roadmap

## The epic

> **Help small web agencies turn an undocumented live client website into an
> evidence-backed redesign baseline for scoping and rebuilding without visual
> guesswork.**

The delivered artifact is a reviewable website rebuild evidence pack.
Source-agnostic by design: TokenScout reads what the browser actually *paints*
(computed styles, rendered DOM, runtime motion) rather than the source CSS or a
design file. It works on any stack: React, WordPress, hand-written HTML, or a
site whose source you'll never see. The driving use case is redesigning an
existing site for the same client. Capture the old site's rendered evidence and
assets so the new build starts from a defensible baseline instead of guesswork.

## Shape

Three packages, one invariant: the published core never depends on a browser.

- **`tokenscout`** (core): pure token math, zero runtime dependencies.
- **`@tokenscout/extract`**: drives a headless browser (Playwright as a peer
  dependency) to produce the raw observations the core reduces.
- **`@tokenscout/transform`**: renders DTCG tokens as CSS custom properties or a
  Tailwind configuration without guessing semantic roles.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the package split and data contract.

## Phases

### Phase 1: Color core (v0.1.0, shipped; extended v0.3.0)
Parse · sRGB→Lab · ΔE76 · perceptual clustering. Tested, CI-gated, zero-dep.
- [x] `hsl()` + named-color parsing (alongside hex / `rgb()`)
- [x] Color-group sprawl metrics (analyzable / unanalyzable / distinct counts +
      sprawl-ratio) to flag undisciplined palettes

### Phase 2: Token reducers (core, shipped)
- [x] Type scale reducer (parse → sort/dedupe + modular-ratio detection)
- [x] Spacing scale reducer (parse → GCD base-grid → quantize)
- [x] `assembleTokens()` → `design-tokens.json` in W3C DTCG format
- [x] `schema.ts` boundary contract (`PageExtract`, `DesignTokens`)
- [x] DTCG structured `$value` for colors
      (`{ colorSpace, components, alpha }`, not a bare hex string)
- [x] Per-token `$extensions` provenance (`com.tokenscout.*`): `css-authored-as`,
      `usage-count`, `css-properties`, `member-count` / `members`
- [x] Stable, name-hinted hashed token ids (deterministic across runs)
- [x] **v0.3.0 published to npm with build provenance.**
- [x] WCAG contrast-pair audit: `com.tokenscout.contrast-pairs` on the color
      group, cross-joining top background/text clusters with a ratio + 4.5:1
      / 3:1 verdict. Still measurement, not judgment — see Non-goals.
- [ ] Semantic role aliasing (`color.background.canvas`, `color.text.primary`,
      `color.action.primary`, … inferred from `cssProperties` + selector
      context, not just raw clusters). Real prerequisite for a `shadcn`-style
      export target and for "paste this and it looks right" exports generally.
- [ ] Per-token source evidence: retain example selectors / DOM roles a
      cluster was seen on (not just the CSS property), so "is this token
      dominant, structural, or accidental?" is answerable from the token
      alone.
- [ ] New token families: radius, shadow/elevation, border, z-index/layers,
      container widths, breakpoints. Currently only color / type / spacing /
      duration are captured.

### Phase 3: Extraction (`@tokenscout/extract`) (in progress)
- [x] Computed-style extraction at multiple breakpoints (the CSSOM read)
- [x] Same-origin link crawl (discover top-N pages)
- [x] `extractSite` / `extractTokens`, with a browser smoke test in CI
- [x] Sitemap-driven discovery (`discoverSitemapUrls`, `parseSitemap`)
- [x] Tech-stack profiling (`profilePage`, `profileStack`)
- [x] Image / asset harvesting: walk the rendered DOM (`<img>`, `srcset`,
      `background-image`, video posters, favicons, OG image) and emit a resolved,
      deduplicated asset manifest (`discoverAssets`, `buildAssetManifest`).
- [x] Asset download: fetch the manifest entries to disk (`downloadAssets`) for
      the redesign-migration "copy the old site's images" workflow.
- [x] Inline SVG icon harvesting, page topology, primary interaction detection,
      text extraction, per-element style harvesting, and breakpoint layout diff
      as composable collectors.
- [ ] CSS custom-property recovery: read declared `--custom-properties` (not
      just resolved computed values), including dark-mode / theme-scope
      overrides — recovers a site's actual naming system, which clustering
      alone throws away.
- [~] Interaction-state capture and CSS diff ships as opt-in primitives for
      scroll and click states. A complete `:hover`, `:focus-visible`, `:active`,
      `:disabled`, and `[aria-expanded]` study is not wired into `inspectSite`.
- [ ] Per-element geometry (selector, role, box `{width, height}`, nearest-
      neighbor distance) for interactive elements at a given breakpoint —
      needed for Fitts's-Law / touch-target auditing (WCAG 2.2 target-size).
      Belongs here, not in core: needs the browser/DOM, not just computed
      styles already collected.

### Phase 4: Animation capture (`@tokenscout/extract`)
The hard, differentiating layer. Web motion comes from three sources, captured at
increasing ambition:

- [~] **CSS**: extract `transition`/`animation-*` and `@keyframes` names into
      animation tokens via `extractAnimations` / `reduceAnimationTokens`. Today
      only **durations** reach DTCG tokens; easings and `@keyframes` names are
      reported but not tokenized. Honest gaps to close:
  - [ ] `@keyframes` **bodies** (step offsets, animated properties, per-step
        easings) — currently only the rule *name* is read, so the actual motion
        is unknown.
  - [ ] `transition-delay` / `animation-delay` longhands (never read today).
  - [ ] `transition: all` transitions (explicitly excluded today, yet extremely
        common — e.g. `tailwindcss-animate`).
  - [ ] Which property a transition animates (`transition-property` is used only
        as a gate, its value discarded).
  - [ ] Tokenize easings + keyframe names (reported but not emitted as tokens).
- [x] **Library detection** (experimental): fingerprint GSAP / Framer Motion /
      AOS / anime.js / Velocity / ScrollMagic / Lottie / Motion One and scrape
      declarative `data-aos` configs via `detectPageMotion` / `detectMotion`.
      Note: this is **dormant in the pipeline** — `inspectSite` does not yet call
      `detectPageMotion`. Wiring it in is the first Phase-4 step.
- [~] **Lottie**: detection and source-URL collection ship with library
      detection; downloading **and parsing** the Lottie JSON (frame count,
      duration, fps, markers) is still pending (composes with `downloadAssets`).
- [ ] **JS-driven (rAF) motion sampling**: the dominant real-world path (GSAP
      tweens, much of Framer Motion) mutates inline styles every frame via rAF
      and bypasses WAAPI entirely — structurally invisible today. Needs a
      rAF / `MutationObserver` style-sampling tier to recover durations, eases,
      and ScrollTrigger-style pins.
- [ ] **Scroll-driven + View Transitions**: read CSS `animation-timeline:
      scroll()/view()` and `scroll-timeline` / `view-timeline` longhands; probe
      `document.startViewTransition`, `view-transition-name`, and
      `::view-transition-*`. Zero capture surface for either today.
- [ ] **Motion-reference video**: Playwright screencast while auto-scrolling and
      hovering, for a visual reference of every motion, source-agnostic.
- [ ] **Normalized motion-token taxonomy**: a single token shape that reconciles
      CSS, WAAPI, and sampled rAF motion (duration / delay / easing / property /
      trigger), instead of the duration-only DTCG output shipping today.
- [~] **Tier 3, runtime instrumentation (research):** `captureMotion` injects a
      pre-load hook that wraps `Element.animate` (Web Animations API) to record
      the effective animation timelines regardless of which library produced
      them, reduced via `reduceWaapiTimelines`. Also **dormant** — exported but
      never invoked in the pipeline. Known limits when run: rAF motion is
      invisible (see above), spring/physics animations resolve with no numeric
      `duration` (recorded `null`, dropped), and only animated property *names*
      are kept, not from/to values. Fragile, per-site tuning expected; an
      optional differentiator, not a blocker for the rest.

### Phase 5: Responsive / multi-screen capture (`@tokenscout/extract`)
Today extraction renders at two fixed CSS widths (`[1280, 375]`), a hard-coded
900px height, DPR 1, and the default (light) media state — then **flattens every
breakpoint into one token set**. `PageExtract.breakpoint` is plumbed through the
seam but discarded in `assembleTokens`, so mobile-vs-desktop deltas dissolve and
dark-mode palettes are never even painted. None of this is done yet:

- [x] Configurable viewport-width list, including tablet widths.
- [ ] Real device profiles: per-screen `newContext({ deviceScaleFactor,
      isMobile })` instead of one reused desktop page.
- [ ] `prefers-color-scheme` dual-theme palette: `emulateMedia({ colorScheme })`
      light + dark passes so a site's dark palette is captured, not invisible.
- [ ] `prefers-reduced-motion` pass for the motion tier.
- [ ] **Per-breakpoint token identity**: stop unioning all `PageExtract`s in
      `assembleTokens`; group/reduce by `breakpoint` and record provenance
      (e.g. a `breakpoints: []` array in per-token `$extensions`). This is the
      real structural work — the field is captured today and thrown away.
- [ ] Full-height / lazy capture: scroll-and-settle to load IntersectionObserver
      and below-the-fold content (pattern exists in the experimental motion tier
      at `instrument-motion.ts`; not in the main extract path).
- [ ] Device-pixel-ratio (retina) capture for asset/image fidelity.
- [ ] Container-query (`@container`) awareness (entirely unaddressed today).

### Phase 6: Evidence transfer and implementation output
- [x] `studySite()` writes `site-report.json`, Design DNA JSON/Markdown, and
      optional light/dark screenshot evidence.
- [x] Design DNA separates observed, inferred, and unknown claims and classifies
      transfer guidance as keep, adapt, improve, or do not copy.
- [x] `@tokenscout/transform` exports CSS custom properties and Tailwind config.
- [ ] Semantic role evidence before `shadcn` or opinionated component mappings.
- [ ] Validate the experimental responsive-invariants contract against real
      withheld-width behavior before promoting it into the default report.

### Phase 7: Release & distribution
- [x] Publish `tokenscout` (core) to npm; registry is currently at `0.3.0`
- [x] Version a public, agent-agnostic TokenScout skill in this repository
- [ ] Publish the unified relaunch set: `tokenscout@0.5.1`,
      `@tokenscout/extract@0.5.1`, and `@tokenscout/transform@0.5.1`
- [ ] Install the repository skill through the `skills` CLI so skills.sh can
      index it after the runtime packages are available
- [ ] Submit to design-tooling lists (e.g. Awesome-Design-Tokens) once published
      and proven, not before (and never to digital-forensics lists; the name
      collision is a coincidence)

### Backlog (not yet a phase)
Later-stage ideas, parked here instead of lost:
- Component fingerprinting (recurring `button.primary` / `card.pricing` /
  `navbar.sticky`-style patterns, with their full token set per instance) —
  valuable, but needs source evidence (Phase 2) and per-element geometry
  (Phase 3) first; premature before either lands.
- Site-to-site diff (`tokenscout diff a.json b.json`) for competitive palette/
  spacing/motion comparison — a `@tokenscout/diff` package, likely, once
  there's more than one report to usefully diff against in practice.

## Non-goals
- Not a digital-forensics / DFIR tool (the name shares a word, nothing else).
- The core will not gain runtime dependencies. Browser weight lives only in
  `@tokenscout/extract`, with Playwright as a peer the consumer installs.
- Design DNA remains deterministic and evidence-linked. LLM narrative and pitch
  voice stay outside the published packages.
