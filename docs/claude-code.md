# tokenscout — Claude Code integration

Three ways to use tokenscout inside Claude Code, Cursor, or Windsurf:

| Surface | Install | How Claude sees it |
|---------|---------|-------------------|
| `/tokenscout` skill | `npx skills add Atroci/tokenscout` | Slash command |
| `@tokenscout/mcp` MCP server | JSON config block | Native `inspect_site` / `extract_tokens` tools |
| `@tokenscout/transform` | `npm install @tokenscout/transform` | Imported in scripts |

---

## `/tokenscout` skill

The skill drives the full extraction pipeline via shell scripts — no config file
required. Good for ad-hoc extraction and one-shot redesign workflows.

### Install

```bash
# Project skill (checked in to .skills-lock.json)
npx skills add Atroci/tokenscout

# Global skill (available in every project)
npx skills add Atroci/tokenscout --global
```

### Invoke

```
/tokenscout <url> [--format dtcg|css-vars|tailwind] [--quick]
```

**Examples:**

```
/tokenscout https://stripe.com
/tokenscout https://linear.app --format css-vars
/tokenscout https://vercel.com --format tailwind
/tokenscout https://github.com --quick
```

### What you get

Claude will surface:

- **Color palette** — perceptual clusters with hex, CSS property roles, and element counts
- **Type scale** — sorted font sizes, detected modular ratio
- **Spacing grid** — values + GCD base unit
- **Animation model** — durations, easings, perf-smell flags, `prefers-reduced-motion` gap
- **Tech stack** — detected framework with confidence
- **Page topology** — section positions, sticky/fixed/full-screen flags *(skipped with `--quick`)*
- **Icons** — unique SVG count + first 5 *(skipped with `--quick`)*
- **Screenshot** — if [agent-browser](https://github.com/vercel-labs/agent-browser) is installed

### Dependencies

The skill installs these automatically if they are missing:

- `@tokenscout/extract` + `playwright` (Playwright peer)
- `@tokenscout/transform` (only when `--format css-vars` or `--format tailwind`)
- Chromium browser: `npx playwright install chromium --with-deps`

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| `ERR_REQUIRE_ESM` on install check | Update to the latest skill (`npx skills update tokenscout`) |
| Bot-detection 403 | Install `agent-browser` and open the page first; the skill falls back to `agent-browser eval` |
| 0 colors / empty tokens | The site uses unresolvable custom properties. Check `report.tokens.color.$extensions.unanalyzable` |
| Timeout | Pass `--timeout 60000` flag or use `--quick` |

---

## `@tokenscout/mcp` MCP server

Exposes `inspect_site` and `extract_tokens` as native MCP tools. Prefer this
over the skill for programmatic workflows where Claude needs to call extraction
inline without shell scripts.

### Install server

```bash
npm install -g @tokenscout/mcp
# or use npx inline — no install needed
```

### Configure

**Claude Code** — add to `.claude/settings.json` (project) or `~/.claude/settings.json` (global):

```json
{
  "mcpServers": {
    "tokenscout": {
      "command": "npx",
      "args": ["@tokenscout/mcp"]
    }
  }
}
```

**Cursor** — add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "tokenscout": {
      "command": "npx",
      "args": ["@tokenscout/mcp"]
    }
  }
}
```

**Windsurf** — add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "tokenscout": {
      "command": "npx",
      "args": ["@tokenscout/mcp"]
    }
  }
}
```

### Tools

#### `inspect_site`

Full site report: tokens + icons + topology + stack + asset manifest.

```
inspect_site(url, options?)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | required | The URL to inspect |
| `breakpoints` | number[] | `[1280, 375]` | Viewport widths in px |
| `deltaE` | number | `12` | CIELAB ΔE76 clustering threshold |
| `assets` | boolean | `true` | Collect image / background asset manifest |
| `animations` | boolean | `true` | Collect CSS animation tokens |
| `icons` | boolean | `true` | Collect deduplicated SVG icon manifest |
| `topology` | boolean | `true` | Map page section topology |

Returns a `SiteReport` JSON object.

#### `extract_tokens`

DTCG tokens only — lighter than `inspect_site`.

```
extract_tokens(url, options?)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | required | The URL to extract from |
| `breakpoints` | number[] | `[1280, 375]` | Viewport widths in px |
| `deltaE` | number | `12` | CIELAB ΔE76 clustering threshold |

Returns a `DesignTokens` DTCG JSON object.

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| Server not starting | Check Node ≥ 20: `node --version`. Reinstall: `npm install -g @tokenscout/mcp` |
| `PLAYWRIGHT_BROWSERS_PATH` missing | Run `npx playwright install chromium` once |
| Tool call returns `isError: true` | Check the `text` field for the Playwright error; likely bot-detection or timeout |

---

## `@tokenscout/transform`

Zero-dependency converter from DTCG tokenscout output to CSS custom properties
or a Tailwind `theme.extend` object.

```bash
npm install @tokenscout/transform
```

```ts
import { transform } from "@tokenscout/transform";
// or import individual converters:
import { toCssVars } from "@tokenscout/transform/css-vars";
import { toTailwindConfig } from "@tokenscout/transform/tailwind";
```

See [README § Format converters](../README.md#format-converters-tokenscout-transform) for full API.
