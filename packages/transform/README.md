# @tokenscout/transform

Turn the token layer of a TokenScout redesign baseline into CSS custom
properties or a Tailwind configuration.

```bash
npm install @tokenscout/transform
```

```ts
import { transform } from "@tokenscout/transform";

const css = transform(tokens, "css-vars");
const tailwind = transform(tokens, "tailwind");
```

Semantic `shadcn` aliases are intentionally not guessed. They remain out of
scope until upstream evidence can distinguish background, text, action, and
border roles.

ESM and Node 20+. Full documentation: https://github.com/Atroci/tokenscout
