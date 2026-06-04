# tokenscout

[![npm version](https://img.shields.io/npm/v/tokenscout.svg)](https://www.npmjs.com/package/tokenscout)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)

Extract **design tokens from a live, rendered website** — not from a CSS file,
not from a Figma export, but from a real page as a browser actually paints it.

Most design-token tooling starts from source CSS or a design file. tokenscout
starts from the rendered result: it reads computed styles off live pages and
reduces them to a clean token set — a perceptually-deduplicated color palette,
type scale, and spacing scale.

**The epic:** point tokenscout at a live URL and get back a faithful, reusable
design-token set — palette, type scale, spacing scale, **and motion** — plus the
site's image assets, ready to seed a redesign. Source-agnostic: it reads what the
browser actually paints, so it works on any stack, framework, or no framework.

> Status: **v0.1.0 — open core.** Shipped: the zero-dependency **color** layer
> (parse · sRGB→Lab · ΔE76 · perceptual clustering), fully tested. Next: the
> live-site **extraction** layer (computed styles, asset harvesting, animation
> capture) and the type/spacing reducers. See [ROADMAP.md](./ROADMAP.md) and
> [ARCHITECTURE.md](./ARCHITECTURE.md).

## Why

- **Live, not source.** What ships to a user's screen ≠ what's in the
  stylesheet (cascades, overrides, third-party widgets, runtime theming).
- **Perceptual, not syntactic.** `#3a7bd5`, `#3b7cd6`, and `rgb(58,123,213)`
  are three strings but one color. tokenscout clusters them in **CIELAB** by
  **ΔE76**, so "47 declared colors → 9 real ones" falls out for free.
- **Zero runtime dependencies.** The color math is ~120 lines of pure
  TypeScript (sRGB→Lab, ΔE76, single-linkage union-find). No native deps.

## Install

```bash
npm install tokenscout   # once published
```

## Use

```ts
import { parseColor, clusterColors } from "tokenscout/color";

const declared = [
  { value: "#3a7bd5", count: 40 },
  { value: "#3b7cd6", count: 5 },
  { value: "rgb(58, 123, 213)", count: 2 },
  { value: "#e23744", count: 12 },
];

const colors = declared
  .map((c) => {
    const p = parseColor(c.value);
    return p ? { value: c.value, rgb: p.rgb, count: c.count } : null;
  })
  .filter((c) => c !== null);

const clusters = clusterColors(colors); // ΔE76 ≤ 2.5 by default
// → 2 clusters: one blue (3 members, canonical "#3a7bd5"), one red.
```

Lower-level building blocks (`rgbToLab`, `deltaE76`) are exported too.

## Roadmap

Two-package shape — a zero-dependency **core** (pure token math) and an
**extract** package that drives a headless browser. Full detail in
[ROADMAP.md](./ROADMAP.md); design in [ARCHITECTURE.md](./ARCHITECTURE.md).

**Core (`tokenscout`, zero deps):**
- [x] Color — parse, sRGB→Lab, ΔE76, perceptual clustering
- [x] Tests + CI
- [ ] Type scale reducer
- [ ] Spacing scale reducer
- [ ] `design-tokens.json` (W3C DTCG) export

**Extract (`@tokenscout/extract`, Playwright peer):**
- [ ] Live crawl + computed-style extraction at breakpoints
- [ ] Image / asset harvesting (manifest + files, for redesign migration)
- [ ] Animation capture — CSS `@keyframes`/transition tokens + Lottie download
      + library detection + motion-reference video, up to runtime WAAPI/rAF
      instrumentation of JS-driven motion (research tier)

**Release:**
- [ ] Publish core to npm (`0.1.x`)

## Contributing

Issues and PRs welcome — especially around color science, CSS value parsing,
and token-scale heuristics. This is an open-core project; the synthesis and
reporting layers on top of it are separate.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev loop and the
zero-runtime-dependency rule, and the [Code of Conduct](./CODE_OF_CONDUCT.md)
before participating. Changes are tracked in [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE) © Hugo Carvalho
