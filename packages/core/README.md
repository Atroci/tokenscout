# tokenscout

Zero-dependency reducers for the token layer of an evidence-backed website
redesign baseline.

```bash
npm install tokenscout
```

```ts
import { assembleTokens } from "tokenscout/tokens";

const tokens = assembleTokens(pages);
```

It clusters rendered colors perceptually, reduces type and spacing scales,
checks common text/background contrast pairs, and emits W3C DTCG tokens.

Use it when you already have rendered observations. To turn an undocumented
live client site into a complete, reviewable rebuild evidence pack, use the
browser package below.

For live browser extraction, use
[`@tokenscout/extract`](https://www.npmjs.com/package/@tokenscout/extract).
Full documentation: https://github.com/Atroci/tokenscout
