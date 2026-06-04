# tokenscout

Extract **design tokens from a live, rendered website** — not from a CSS file,
not from a Figma export, but from a real page as a browser actually paints it.

Most design-token tooling starts from source CSS or a design file. tokenscout
starts from the rendered result: it reads computed styles off live pages and
reduces them to a clean token set — a perceptually-deduplicated color palette,
type scale, and spacing scale.

> Status: **early / open core.** The color layer is the first public surface.
> Crawl + computed-style extraction and the type/spacing reducers land next.

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

- [x] Color: parse, sRGB→Lab, ΔE76, perceptual clustering
- [ ] Live crawl + computed-style extraction (headless)
- [ ] Type scale reducer
- [ ] Spacing scale reducer
- [ ] `design-tokens.json` (W3C DTCG format) export
- [ ] Tests + CI

## Contributing

Issues and PRs welcome — especially around color science, CSS value parsing,
and token-scale heuristics. This is an open-core project; the synthesis and
reporting layers on top of it are separate.

## License

[MIT](./LICENSE) © Hugo Carvalho
