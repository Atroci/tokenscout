# tokenscout: agent context

Design-token extraction library with a zero-dependency core and a Playwright-backed
extractor. Public MIT repo at https://github.com/Atroci/tokenscout.

## Repo layout

```
packages/
  core/           tokenscout npm package (zero deps, color math + DTCG assembly)
  extract/        @tokenscout/extract (Playwright peer, live URL extraction)
  transform/      @tokenscout/transform (DTCG to CSS vars / Tailwind, zero deps)
  mcp/            @tokenscout/mcp (MCP stdio server for Claude Code / Cursor)
skills/
  tokenscout/     SKILL.md for the /tokenscout slash command
docs/
  claude-code.md  MCP + skill install + config reference
  codex.md        Codex-specific usage
```

## Build

```bash
npm run build         # all packages in dependency order
npm run typecheck     # tsc --noEmit across all packages including mcp
npm test              # core + extract + transform test suites
```

## Rules

- ESM throughout. Node 20+. No CommonJS.
- Zero runtime dependencies in `tokenscout` core and `@tokenscout/transform`.
  Playwright is a peer dependency of `@tokenscout/extract` only.
- All color math is pure TypeScript: sRGB to Lab, deltaE76, single-linkage
  union-find. No color library imports.
- DTCG schema types live in `packages/core/src/schema.ts`. Do not duplicate them.
- Shared type guards for token values live in
  `packages/transform/src/guards.ts`. Import from there; do not copy.

## Using tokenscout inside Codex

Install the skill once (global, available in every project):

```bash
npx skills add Atroci/tokenscout --global
```

Then invoke in any Codex session:

```
/tokenscout https://example.com
/tokenscout https://example.com --format css-vars
/tokenscout https://example.com --format tailwind
/tokenscout https://example.com --quick
```

For automated extraction in a Codex task, use `@tokenscout/extract` directly:

```typescript
import { extractTokens } from "@tokenscout/extract";
const tokens = await extractTokens("https://example.com");
```

Full Codex guide: `docs/codex.md`.
