# tokenscout — roadmap

## The epic

> **Point tokenscout at a live URL and get back a faithful, reusable design-token
> set — palette, type scale, spacing scale, and motion — plus the site's image
> assets, ready to seed a redesign.**

Source-agnostic by design: tokenscout reads what the browser actually *paints*
(computed styles, rendered DOM, runtime motion), not the source CSS or a design
file. So it works on any stack — React, WordPress, hand-written HTML, or a site
whose source you'll never see. The driving use case is **redesigning an existing
site for the same client**: capture the old site's real design language and assets
so the new build starts from truth instead of guesswork.

## Shape

Two packages, one invariant: **the published core never depends on a browser.**

- **`tokenscout`** (core) — pure token math, **zero runtime dependencies**.
- **`@tokenscout/extract`** — drives a headless browser (Playwright as a peer
  dependency) to produce the raw observations the core reduces.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the package split and data contract.

## Phases

### ✅ Phase 1 — Color core (v0.1.0, shipped)
Parse · sRGB→Lab · ΔE76 · perceptual clustering. Tested, CI-gated, zero-dep.

### ✅ Phase 2 — Token reducers (core, shipped)
- [x] Type scale reducer (parse → sort/dedupe + modular-ratio detection)
- [x] Spacing scale reducer (parse → GCD base-grid → quantize)
- [x] `assembleTokens()` → `design-tokens.json` in **W3C DTCG** format
- [x] `schema.ts` boundary contract (`PageExtract`, `DesignTokens`)

### Phase 3 — Extraction (`@tokenscout/extract`)
- [ ] Sitemap / link crawl (discover top-N pages)
- [ ] Tech-stack profile (fingerprint frameworks, CSS-in-JS, etc.)
- [ ] Computed-style extraction at multiple breakpoints (the CSSOM read)
- [ ] **Image / asset harvesting** — walk the rendered DOM (`<img>`, `srcset`,
      `background-image`, SVG, video posters, OG/favicons), download, and emit an
      asset manifest. Direct support for the redesign-migration "copy the old
      site's images" workflow.

### Phase 4 — Animation capture (`@tokenscout/extract`)
The hard, differentiating layer. Web motion comes from three sources, captured at
increasing ambition:

- [ ] **CSS** — extract `@keyframes` + `transition`/`animation-*` into animation
      tokens (durations, easings, keyframe definitions). Statically tractable.
- [ ] **Lottie** — detect + download Lottie JSON; directly reusable in the new
      site as-is.
- [ ] **Library detection** — fingerprint GSAP / Framer Motion / AOS and scrape
      declarative configs (`data-*`, exposed options) where present.
- [ ] **Motion-reference video** — Playwright screencast while auto-scrolling and
      hovering; a visual reference of every motion, source-agnostic.
- [ ] **Tier 3 — runtime instrumentation (research):** inject a pre-load hook that
      wraps `Element.animate` (Web Animations API) and samples rAF-driven style
      mutations, recording the *effective* animation timelines regardless of which
      library produced them — JS motion captured into reusable keyframes. Fragile,
      per-site tuning expected; pursued as an open-core differentiator, not a
      blocker for the rest of the package.

### Phase 5 — Release & distribution
- [ ] Publish `tokenscout` (core) to npm (`0.1.x`)
- [ ] Publish `@tokenscout/extract` once Phase 3 is usable end-to-end
- [ ] Submit to design-tooling lists (e.g. Awesome-Design-Tokens) once published
      and proven — **not** before (and never to digital-forensics lists; the name
      collision is a coincidence)

## Non-goals
- Not a digital-forensics / DFIR tool (the name shares a word, nothing else).
- The core will not gain runtime dependencies. Browser weight lives only in
  `@tokenscout/extract`, with Playwright as a peer the consumer installs.
- The redesign *synthesis / brief-writing* layer (LLM narrative, pitch voice)
  stays in the private parent pipeline — tokenscout is the open extraction core.
