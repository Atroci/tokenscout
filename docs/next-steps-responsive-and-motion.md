# tokenscout: next steps: responsive / multi-screen capture & animation accuracy

Status: design doc / roadmap. Implementation-oriented, grounded in the current
source. Cited line numbers are against `packages/extract/src/*` and
`packages/core/src/*` as of `tokenscout@0.3.0`.

Scope note (parent boundary): the private `web-forensics` pipeline carries a
locked "CSS-only animation, no JS anim libs" decision. **That lock does not bind
tokenscout.** `detect-motion.ts` and `instrument-motion.ts` already exist here as
Phase-4 differentiators; the motion work below is tokenscout roadmap, not a
violation of the parent.

Effort key: **S** = <½ day, **M** = 1–2 days, **L** = multi-day / touches the
seam contract.

---

# Part 1: Responsive / multi-screen capture

## 1.1 Where we are

- **Defaults: `breakpoints = [1280, 375]`, `top = 1`.** Two widths only (desktop + mobile). Defined in `extract/src/index.ts:31` (`extractSite`) and
  `extract/src/index.ts:110` (`inspectSite`), documented at `index.ts:16`.
- **Height hard-coded to 900px, never varies.** `extract-page.ts:56`
  (`page.setViewportSize({ width: breakpoint, height: 900 })`); the extras pass
  in `inspectSite` forces `height: 900` again at `index.ts:140-143`.
- **DPR = 1, no device emulation.** Pages come from a bare `browser.newPage()`
  (`index.ts:35`, `index.ts:130`). No `deviceScaleFactor`, no
  `chromium.devices[...]`, no touch/UA/mobile-platform string. Breakpoints are
  pure CSS widths, not device profiles.
- **The breakpoint-flattening seam.** `PageExtract.breakpoint` exists
  (`schema.ts:31`) and is populated (`harvest.ts` via `extract-page.ts:59`), but
  it is **never read downstream**. `assembleTokens` (`core/tokens/index.ts:37`)
  takes `pages: PageExtract[]` and unions across all of them:
  - colors: `for (const page of pages) for (const obs of page.colors)`
    (`tokens/index.ts:89-90`)
  - type / spacing: `reduceTypeScale(pages, …)` / `reduceSpacingScale(pages, …)`
    (the `buildFontSizeGroup` / `buildSpacingGroup` calls).
  The `(page × breakpoint)` loop at `index.ts:38-42` / `:133-137` produces N
  extracts; `assembleTokens` merges them with **no grouping by
  `page.breakpoint`**. Mobile-vs-desktop differences dissolve into one set.
  `breakpoint` is dead metadata the moment it leaves the extractor: this is the
  single biggest structural gap in Part 1.
- **No media emulation.** Grep for `emulateMedia` / `colorScheme` / `prefers-`
  is clean. Dark mode, reduced-motion, forced-colors, print: all uncaptured.
  A site's entire dark palette is invisible to the pipeline.
- **No scrolling in the token path.** `extract-page.ts:57-58` does
  `goto(url, { waitUntil: "load" })` then `evaluate(collectObservations)` at the
  fixed 900px-tall viewport. Lazy / IntersectionObserver content below 900px
  that hasn't loaded is missed. `waitUntil: "load"` (not `networkidle`) means
  late lazy assets may not even be in the DOM. The only scroll anywhere is
  `instrument-motion.ts:116`, in the dormant WAAPI tier: not the token path.

## 1.2 Proposals

### (A) Configurable + richer breakpoint set: S

**Why 1280/375 alone is thin.** Two widths miss the tablet band (768–1024px)
where most responsive grids reflow (2-col → 1-col), and miss large-desktop
(≥1536px) where max-width containers and fluid clamps top out. A token set
reduced from only 1280 + 375 systematically under-samples the spacing/type
scale that lives in between.

**Seam to touch.** `breakpoints` is already an array param
(`index.ts:16,31,110`) and the `(page × breakpoint)` loop already handles N
(`index.ts:38-42`, `:133-137`). Just change the default to a 3–4 width set, e.g.
`[1536, 1280, 768, 375]`, and document it. No contract change.

**Caveat.** Height stays 900 (`extract-page.ts:56`) and DPR stays 1. True device
emulation (tablet portrait, retina) needs a per-screen
`browser.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch })`
instead of reusing one `newPage()`: that's proposal (E)/(F), not this one.
Widths-only is a real, cheap improvement on its own.

### (B) Capture `prefers-color-scheme` light AND dark → dual palette: M  ★ highest value

This is the single highest-value addition. Most modern sites ship a dark theme;
today tokenscout renders only Chromium's default (light) state, so half the
brand palette is silently absent.

**How.** Playwright exposes `page.emulateMedia({ colorScheme: 'light' | 'dark' })`
(supported values `light` / `dark`; `null` disables): confirmed against current
Playwright docs. Per inspected URL, render twice: emulate `light`, collect; then
emulate `dark`, collect.

**Seam to touch.**
1. `extract-page.ts:56-57`: call `page.emulateMedia({ colorScheme })` before
   `collectObservations`. Thread a `colorScheme` arg into `extractPage`.
2. `schema.ts:28-35`: add a `colorScheme?: "light" | "dark"` field to
   `PageExtract` alongside `breakpoint` (same plumbing pattern).
3. `index.ts:38-42` / `:133-137`: extend the loop to
   `(page × breakpoint × scheme)`.

**How it flows into a themed token set.** Don't merge the two schemes into one
flat palette: that re-creates the breakpoint-flattening bug for color. Two
viable shapes, in order of preference:

- **Themed sub-documents (preferred):** emit `color.light.*` and `color.dark.*`
  groups, each reduced independently by `buildColorGroup` (`tokens/index.ts:79`)
  over only that scheme's extracts. Clean DTCG; consumers pick a theme.
- **Provenance extensions:** keep one merged palette but tag each token with
  `com.tokenscout.schemes: ["light","dark"]` (reusing the `$extensions`
  convention already at `tokens/index.ts:126-132`). Cheaper, but loses the
  "this teal is the dark-mode surface" semantics. Use only if a flat consumer
  contract must be preserved.

This requires `buildColorGroup` to accept a pre-filtered `pages` slice (filter by
`page.colorScheme`): small refactor, same function.

### (C) `prefers-reduced-motion` capture: S (after motion tier is wired)

`page.emulateMedia({ reducedMotion: 'reduce' | 'no-preference' })` exists in
Playwright (confirmed). Capturing the reduced-motion variant tells you which
animations a site actually suppresses for accessibility: a real signal for a
motion brief.

**Seam.** Same `emulateMedia` call site as (B) at `extract-page.ts:56` /
`index.ts:140`. Thread a `reducedMotion` axis onto the motion extras pass
(`index.ts:144-152`) once the motion functions are wired (Part 2 §0). Low value
until motion capture itself is live, so sequence it after Part 2.

### (D) Preserve per-breakpoint identity: L  ★ the real structural work

The seam is **already there and thrown away**: `PageExtract.breakpoint`
(`schema.ts:31`) is populated and discarded at `tokens/index.ts:89` / the type
& spacing reducer calls. To preserve deltas:

1. **Stop flattening.** `assembleTokens` (`tokens/index.ts:37`) must stop
   treating `pages` as one bag. Either (a) group by `page.breakpoint` before
   reducing, or (b) run the reducers per breakpoint and diff.
2. **Give `DesignTokens` somewhere to record it.** `DesignTokens` (`schema.ts:80`)
   is a flat DTCG group with no "this token only appears at 375px" slot. Two
   options:
   - **Per-token provenance extension (recommended, low-friction):** tag each
     token with `com.tokenscout.breakpoints: [375, 1280]` via the existing
     `$extensions` convention (`tokens/index.ts:126-132`). One union palette,
     but now every token knows where it appeared.
   - **Per-breakpoint sub-documents:** `tokens.byBreakpoint["375"] = { … }`.
     Heavier; only if consumers need fully separate sets.
3. **Decide semantics explicitly.** Today it's a silent union with no
   provenance. State the choice: union (current) vs. intersection (only tokens
   present at every width: the "stable core") vs. per-breakpoint sets. The
   recommendation: keep the union but attach a `breakpoints` provenance array so
   nothing is lost and intersection can be derived later.

Example token shape with provenance (extends the existing color token at
`tokens/index.ts:119-133`):

```jsonc
"color-2f1a-teal": {
  "$value": { "colorSpace": "srgb", "components": [0.04, 0.55, 0.51], "alpha": 1 },
  "$type": "color",
  "$extensions": {
    "com.tokenscout.css-authored-as": "rgb(10, 140, 130)",
    "com.tokenscout.usage-count": 37,
    "com.tokenscout.breakpoints": [1280],        // ← new: desktop-only token
    "com.tokenscout.schemes": ["light", "dark"]  // ← from proposal (B)
  }
}
```

This is the highest-leverage change in Part 1 because the data is *already
captured and silently dropped*: it's a reducer change, not a new collection
path.

### (E) Full-height / scroll-to-load for lazy content: M

Below-900px lazy content is invisible (§1.1). Add a scroll-and-settle step
before `collectObservations`:

1. In `extract-page.ts` (around `:56-57`), after `goto`, read
   `document.body.scrollHeight`, then `window.scrollBy(0, vh)` in a loop to the
   bottom (the pattern already exists at `instrument-motion.ts:116`, cap the
   total like its 20000px guard at `:136-141`), `waitForTimeout` a short settle
   between steps to let IntersectionObserver fire, scroll back to top, then
   collect.
2. Optionally upgrade `waitUntil: "load"` → `"networkidle"` (or `load` +
   explicit settle) so late lazy assets are in the DOM.

**Limit.** Infinite-scroll feeds never "end"; the px cap is a deliberate
truncation, not full coverage. Honest framing: this recovers static
below-the-fold sections, not endless feeds.

### (F) DPR for retina assets: S–M

Asset harvesting (`harvest-assets.ts`) records source URLs but renders at DPR 1,
so it can't distinguish a 1x asset from the 2x a retina viewport would request.
Set `deviceScaleFactor: 2` on a `browser.newContext(...)` for an asset-only pass.
Affects the asset manifest, not token math. Lower priority than (B)/(D); bundle
it with (A)'s move to per-screen contexts.

## 1.3 Recommended sequencing (Part 1)

1. **(A) richer breakpoints**: S, zero contract change, immediate sampling win.
2. **(B) light+dark dual palette**: M, highest value; ship as themed
   sub-documents. Lands the biggest missing chunk of the brand palette.
3. **(D) per-breakpoint provenance**: L, the structural fix; do it via the
   `$extensions` provenance array (cheapest path that loses nothing). (B) and
   (D) share the same "thread an axis through the seam, stop flattening in
   `buildColorGroup`" refactor: do (B) first, generalize for (D).
4. **(E) scroll-to-load**: M, recovers below-fold tokens.
5. **(C) reduced-motion** + **(F) DPR**: S, opportunistic, after the motion
   tier (Part 2) and the per-screen `newContext` refactor exist.

---

# Part 2: Animation capture accuracy

## §0 What runs today vs. what merely exists

- **`inspectSite` only calls `extractAnimations` (CSS)**: `index.ts:149-151`.
  `detectPageMotion` and `captureMotion` are **exported but never invoked**
  (`index.ts:226-244` are re-exports only). In any real run, only CSS-animation
  tokens are produced; library detection and WAAPI capture are dormant functions
  a consumer must call by hand.
- **Only ms durations reach DTCG.** `inspectSite` passes
  `{ durations: animationTokens.durations }` to `assembleTokens`
  (`index.ts:155-158`). Easings and `@keyframes` names are returned on
  `SiteReport.animations` (`index.ts:88`) **as a report only**: never tokenized.
  The `duration` group (`tokens/index.ts:60-77`) is the sole motion DTCG output.
- **Extras collected once, widest breakpoint only** (`index.ts:139-144`). No
  per-breakpoint motion identity; mobile-specific transitions are invisible.

So Phase-4 work *starts by calling the functions that already exist*, not by
writing them.

## §1 Taxonomy: capturable TODAY vs. the ceiling

| Source | What drives it | Capturable today | Ceiling | Gap |
|---|---|---|---|---|
| **CSS: Tailwind / `tailwindcss-animate`** | Pure CSS transitions/animations + `@keyframes` | Durations (ms) → tokens; easings + keyframe **names** → report only | **Fully capturable**: it's all in computed style + the CSSOM | `transition: all` is excluded (`animations.ts:108`); `transition-delay`/`animation-delay` never read; keyframe **bodies** dropped (`animations.ts:135-137`); `ease`/`linear` dropped as no-op |
| **WAAPI: Motion (`motion.dev`) / Framer Motion** | Hybrid engine: WAAPI for hardware-accelerated transform/opacity, rAF for everything else | Only via dormant `instrument-motion.ts` wrap of `Element.animate` | **Partial**: only the WAAPI half is reachable | Motion's **springs** resolve with no numeric `duration` → recorded `null` (`:62`) then dropped; Framer's layout/drag/spring run on **rAF**, invisible; detection flags Framer only via `data-framer-*` attrs, no values |
| **rAF: GSAP** | rAF + per-frame inline-style mutation; **zero WAAPI calls** | Global detection only (dormant) | **Best-effort via sampling** (§2.2): never exact | `instrument-motion.ts:6-8` admits rAF is out of scope. You learn "GSAP present" and nothing about durations, eases, ScrollTrigger pins, or timelines |
| **Scroll-driven CSS: `animation-timeline: scroll()/view()`** | CSS; progress bound to scroll, not time | Keyframe **name** may be picked up incidentally | **Detectable + classifiable** (it's CSS longhands) | `animation-timeline` / `scroll-timeline` / `view-timeline` longhands are never read; no notion that an animation is scroll-linked vs time-based |
| **View Transitions API** | `document.startViewTransition` + `::view-transition-*` pseudos | Nothing | **Detectable** (probe the API + `view-transition-name`) | Completely unhandled: no probe, no global, no DOM marker |
| **Lottie** | JSON/dotLottie played by lottie-web/bodymovin | Detected; source URLs listed (dormant) | **Fully parseable** if the `.json` is fetched | Never downloads/parses the JSON (`detect-motion.ts:109-112`); no frame count, duration, fps, markers |

**Library-engine facts (sourced, current):** Motion is the only library with a
**hybrid engine**: it runs animations via *either* WAAPI (its `NativeAnimation`
class, hardware-accelerated, compositor thread) *or* `requestAnimationFrame` (its
`JSAnimation` class, main thread), selecting automatically; springs and
anything WAAPI can't express fall to rAF. **GSAP** is rAF-only: it mutates inline
styles every frame on the main thread and issues zero WAAPI calls. This is *why*
wrapping `Element.animate` (`instrument-motion.ts`) catches part of Motion and
none of GSAP. (Sources at end.)

**Standards-status facts (sourced):** CSS scroll-driven animations are **not
Baseline**: Chromium 115+, Safari 18+, Firefox behind a flag (~85% caniuse).
View Transitions: **same-document is Baseline** (Chrome 111+, Safari 18+, Firefox
144+); cross-document is Chromium 126+ / Safari 18.2+, Firefox flagged. Treat
both as progressive enhancements: tokenscout's capture for them is **detection +
classification**, not full reproduction.

## §2 Concrete accuracy upgrades

### (1) Capture `@keyframes` BODIES, not just names: M

Today `collectAnimations` records only `CSSKeyframesRule.name` (rule type 7,
`animations.ts:124-140`). The 0%/50%/100% step rules, the transformed
properties, and per-keyframe easings are discarded (`:135-137`).

**Approach.** A `CSSKeyframesRule` exposes `.cssRules`, each a `CSSKeyframeRule`
with `.keyText` (the offset, e.g. `"50%"`) and `.style` (a `CSSStyleDeclaration`).
Iterate them, emit `{ name, steps: [{ offset, declarations: {prop: value} }] }`.
Keep the existing per-sheet cross-origin try/catch guard (`animations.ts:124-140`):
same-origin sheets only; cross-origin keyframes stay name-only (honest limit).

**Where it lands.** This is structured motion data, not a scalar: DTCG has no
keyframe type. Put it under group `$extensions`, e.g.
`com.tokenscout.keyframes: { fade-in: { steps: [...] } }`, mirroring the
color-sprawl extensions pattern (`tokens/index.ts:136-140`).

### (2) rAF / MutationObserver sampling to recover JS-driven motion (the GSAP gap): L

GSAP and Framer's rAF path bypass WAAPI entirely, so wrapping `Element.animate`
can't see them. The only way to observe them programmatically is to **sample the
rendered result over time**.

**Sampling strategy.**
1. Pick candidate elements: those flagged by `detect-motion.ts` (library
   present), elements with `data-*` motion attrs, and a bounded set of
   transform/opacity-changing nodes near the viewport.
2. Install a sampler in an init script: on each `requestAnimationFrame` tick
   (or via a `MutationObserver` on inline `style`), read
   `getComputedStyle(el).transform` / `opacity` (and `filter`) and push
   `{ t, el-id, transform, opacity }`.
3. Drive the page: scroll through it (reuse the
   `instrument-motion.ts:116`/`:136-141` autoscroll) and hover candidate
   elements to trigger hover-driven tweens.
4. Reduce the per-element time-series to a *signature*: detected duration (first
   change → settle), peak/Δ transform, easing **shape** (approximate by fitting
   sampled progress to a cubic-bezier family: best-effort, label it as
   inferred).

**Limits (state them plainly):**
- Recovers **timing and magnitude**, not the authored API call. You get "this
  element translated 40px over ~600ms with ease-out-ish progress," never
  "`gsap.to(x, {duration:0.6, ease:'power2.out'})`."
- Sampling resolution is capped by frame rate (~16ms) and by what you scroll/
  hover into view: interaction-gated and scroll-gated animations off the driven
  path are missed.
- Easing fit is approximate; spring physics (stiffness/damping) can't be
  recovered from a sampled curve with confidence: mark as `inferred`, never
  emit as a precise token.
- Heavier and slower than CSS capture; gate behind an opt-in flag, not the
  default `inspectSite` path.

### (3) Scroll-driven animation + View Transitions capture: S (detection) / M (classification)

**Scroll-driven CSS.** Extend `collectAnimations` (`animations.ts:98-143`) to
read `animation-timeline`, `scroll-timeline`, `view-timeline` from computed
style. When `animation-timeline` is `scroll(...)` / `view(...)`, classify that
animation's `trigger` as `scroll` instead of `time`. Cheap: it's just more
longhands at the existing collection site. Don't try to *reproduce* the scroll
binding (not Baseline); just record that it exists and which keyframes it drives.

**View Transitions.** Probe in the browser context:
`typeof document.startViewTransition === "function"` (capability) and
`document.querySelectorAll('[style*="view-transition-name"], [class]')` plus a
CSSOM scan for `::view-transition` pseudos / `view-transition-name` declarations
(usage). Emit a presence + named-region report. Detection only: same-document
VT is Baseline but reproduction is out of scope. New tiny collector alongside
`detect-motion.ts`.

### (4) Motion-reference video via Playwright screencast: M

When programmatic capture is partial (rAF, springs, scroll-driven), a recorded
video is the ground-truth fallback a human (or the brief's reviewer) can eyeball.

**Approach.** Use Playwright's video recording
(`browser.newContext({ recordVideo: { dir } })`) for a dedicated motion pass:
load the page, run a deterministic driver: autoscroll top→bottom at a fixed rate
(reuse `instrument-motion.ts:116`), pause on sections, hover the candidate
elements from §2.2: then save the `.webm`. Store it next to the run's JSON as a
non-tokenized artifact referenced from `SiteReport`.

**Framing.** This is a *reference*, not a token source: it doesn't feed
`assembleTokens`. It's the honest answer to "we can't programmatically capture
GSAP timelines": ship the video so the value isn't lost. Opt-in; it costs
wall-clock and disk.

### (5) Normalized motion-token taxonomy → DTCG mapping: M

Define one normalized shape so every source (CSS, WAAPI, sampled, scroll) reduces
to the same vocabulary:

```
MotionToken = {
  duration: number,            // ms     : already a DTCG `duration` token
  easing:   string,            // cubic-bezier()/steps()/inferred-bezier
  delay:    number,            // ms     : NOT captured today (gap)
  property: string,            // transform | opacity | <named> | "unknown"
  trigger:  "time" | "scroll" | "hover" | "view-transition" | "load",
  source:   "css" | "waapi" | "sampled-raf" | "scroll-timeline" | "lottie",
  confidence: "exact" | "inferred"
}
```

**DTCG mapping.**
- **Duration** → keep the existing `duration` group
  (`tokens/index.ts:60-77`), `$type: "duration"`, `{value, unit:"ms"}`. Already
  done.
- **Easing / delay / property / trigger / source / confidence** → DTCG has **no
  motion/easing type**, so do **not** invent W3C compliance (matches the parent
  product's "don't invent token-spec compliance" rule). Put them under group
  and/or token `$extensions`, mirroring the color-sprawl pattern
  (`tokens/index.ts:136-140`):
  - `com.tokenscout.easings: [...]` (group-level, de-duped: the data already on
    `SiteReport.animations.easings`, just promoted into the token doc).
  - `com.tokenscout.motion: [ MotionToken, ... ]` for the full normalized list,
    with `confidence` distinguishing exact (CSS/WAAPI) from inferred (sampled).
- **Capture the two missing scalars first:** `transition-delay` /
  `animation-delay` are never read today: add them to `collectAnimations`
  (`animations.ts:107-119`) since they're free (already in computed style) and
  feed `delay` directly.

## §3 Accuracy ceiling: honest statement

Programmatic JS-motion capture is **best-effort and has a hard ceiling.** The
dominant real-world motion path is rAF inline-style mutation (all of GSAP, much
of Framer/Motion's non-WAAPI work), and it is structurally invisible to any
API-wrapping approach: you cannot recover the authored `gsap.to(...)` call,
only sample its rendered result. Springs resolve to no fixed duration and can't
be expressed as a duration+easing token at all.

The realistic target is a **dual (really triple) strategy**, layered by
confidence:

1. **Instrument** (exact): CSS computed style + CSSOM keyframe bodies + WAAPI
   `Element.animate` wrap → `confidence: "exact"` tokens.
2. **Sample** (inferred): rAF/MutationObserver time-series on driven elements →
   `confidence: "inferred"` timing/magnitude signatures, never precise easings or
   spring params.
3. **Video reference** (ground truth for humans): Playwright screencast of an
   auto-scroll/hover pass → non-tokenized `.webm` artifact for the cases (1) and
   (2) can't fully express.

tokenscout should be explicit in its output about which tier produced each
motion signal. Selling "exact" capture of GSAP timelines would be dishonest; the
defensible product claim is "exact for CSS/WAAPI, inferred-with-confidence for
rAF, video reference for the rest."

---

# Recommended first PRs

Ordered; each shippable independently.

1. **Light + dark dual palette** (Part 1 B, M). Highest value. `emulateMedia({colorScheme})`
   at `extract-page.ts:56`, add `colorScheme` to `PageExtract` (`schema.ts:28-35`),
   emit `color.light.*` / `color.dark.*` from `buildColorGroup`
   (`tokens/index.ts:79`). Recovers the missing half of the brand palette.

2. **Per-breakpoint provenance via `$extensions`** (Part 1 D, M–L). Stop
   flattening in `assembleTokens` (`tokens/index.ts:37,89`); tag tokens with
   `com.tokenscout.breakpoints: [...]` using the field that's already captured
   and discarded (`schema.ts:31`). Reducer change, no new collection. Shares the
   "thread an axis, stop flattening" refactor with PR 1.

3. **Wire the dormant motion functions + capture delays** (Part 2 §0/§5, S–M).
   Call `detectPageMotion` (and optionally `captureMotion` behind a flag) inside
   `inspectSite` (`index.ts:149-151`); add `transition-delay`/`animation-delay`
   reads to `collectAnimations` (`animations.ts:107-119`); promote `easings` into
   the token doc under `com.tokenscout.easings`. Cheap, turns existing dead code
   live.

4. **`@keyframes` bodies + scroll/View-Transition detection** (Part 2 §1/§3, M).
   Iterate `CSSKeyframesRule.cssRules` for step bodies (`animations.ts:124-140`);
   read `animation-timeline` to classify `trigger: scroll`; probe
   `document.startViewTransition`. Detection + classification, no reproduction.

5. **Richer breakpoints + scroll-to-load** (Part 1 A/E, S–M). Default to a 3–4
   width set (`index.ts:31,110`); add the autoscroll-and-settle step before
   `collectObservations` (`extract-page.ts:56-57`, reusing the
   `instrument-motion.ts:116` pattern) to recover below-the-fold lazy tokens.

The rAF/MutationObserver sampler (Part 2 §2.2) and motion-reference video
(§2.4) are deliberately *not* in the first five: they're the L-effort,
opt-in, best-effort tier and should land only after PRs 1–4 prove the
exact-capture surface.

---

## Sources

- Motion hybrid engine (WAAPI `NativeAnimation` vs rAF `JSAnimation`, automatic
  selection; GSAP is rAF/main-thread): motion.dev: *Improvements to the Web
  Animations API*, *Web Animation Performance Tier List*; DeepWiki
  *motiondivision/motion: Animation Engines*.
- CSS scroll-driven animations (`animation-timeline: scroll()/view()`, not
  Baseline, Chromium 115+/Safari 18+/Firefox flagged): MDN *Scroll-driven
  animations* / *animation-timeline*; Chrome for Developers blog.
- View Transitions API (same-document Baseline; cross-document Chromium 126+ /
  Safari 18.2+): MDN *View Transition API*; web.dev *Same-document view
  transitions are now Baseline*.
- Playwright `emulateMedia({ colorScheme, reducedMotion })`: playwright.dev
  *class Page* API.
