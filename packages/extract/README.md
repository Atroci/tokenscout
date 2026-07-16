# @tokenscout/extract

Turn an undocumented live client website into an evidence-backed redesign
baseline for scoping and rebuilding.

```bash
npm install @tokenscout/extract playwright
npx playwright install chromium
```

```ts
import { studySite } from "@tokenscout/extract";

await studySite("https://example.com", {
  outDir: "./tokenscout-study",
  breakpoints: [1440, 768, 390],
});
```

The study writes a reviewable website rebuild evidence pack: measured site
evidence, W3C DTCG tokens, assets, motion, icons, topology, interactions,
light/dark screenshots, and a conservative Design DNA brief. Observations,
inferences, unknowns, and transfer guidance remain visibly separate.

TokenScout records what the browser presents. It does not recover original
design intent or replace professional judgment.

Playwright is a peer dependency. ESM and Node 20+.
Full documentation: https://github.com/Atroci/tokenscout
