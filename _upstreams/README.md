# _upstreams

Scratch space for cloning **adjacent open-source projects** to study and to
prepare contributions against — the "pull other projects here to feed, fix,
grow this scope" workspace.

Everything in this folder **except this README is gitignored** — cloned repos
never get committed into tokenscout.

Suggested first pulls (design-tooling ecosystem, all active + receptive):

```bash
cd _upstreams
git clone --filter=blob:none https://github.com/projectwallace/css-analyzer
git clone --filter=blob:none https://github.com/style-dictionary/style-dictionary
git clone --filter=blob:none https://github.com/color-js/color.js
```

Workflow: study upstream → land a small PR to build standing → port useful
ideas back into tokenscout's core → push to `Atroci/tokenscout`.

### Live target: css-analyzer perceptual-palette gap

`projectwallace/css-analyzer` reports color **formats** and unique color
**strings**, but has **no perceptual analysis** — `#3a7bd5` and `#3b7cd6` count
as two colors. tokenscout's `clusterColors` (CIELAB ΔE76, zero deps) fills
exactly that gap. Plan: land a small value-helper PR first (e.g. issue #605
`isGradientFunction`), then open an issue proposing a perceptual "color sprawl"
analyzer before building it. Lead with "zero dependencies" — they are
perf/dep-conscious.
