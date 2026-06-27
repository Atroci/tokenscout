---
name: tokenscout
description: >
  Extract design tokens (colors, typography, spacing, animation, icons, page topology)
  from any live website as W3C DTCG JSON, CSS custom properties, or Tailwind config.
  Use when the user asks to: extract design tokens from a URL, get a site's color
  palette or font scale, clone or reverse-engineer a site's design system, generate
  a Tailwind config or CSS variables from a live URL, audit a competitor's visual
  identity, understand a site's animation model or interaction patterns, or map a
  page's section layout. Trigger on any mention of "extract tokens", "design system
  from URL", "clone this site's design", "what fonts/colors does X use", or
  "tokenscout".
allowed-tools: Bash(npx:*), Bash(node:*), Bash(agent-browser:*)
argument-hint: "<url> [--format css-vars|tailwind|dtcg] [--quick]"
license: MIT
---

# /tokenscout: Design Token Extraction

Extract a live site's complete design token set: perceptual color clusters, type
scale, spacing grid, animation tokens, SVG icons, and page topology. Outputs W3C
DTCG JSON (consumable by Style Dictionary v4, Token Studio, Supernova, Specify).

## Parse arguments

`$ARGUMENTS` is the URL plus optional flags.

```bash
URL=$(echo "$ARGUMENTS" | awk '{print $1}')
FORMAT=$(echo "$ARGUMENTS" | grep -oP '(?<=--format )\S+' || echo "dtcg")
QUICK=$(echo "$ARGUMENTS" | grep -q -- '--quick' && echo 1 || echo 0)
```

If `$URL` is empty or doesn't look like a URL, ask the user:
> Which URL should I extract design tokens from?

## Step 1: Check installation

```bash
node -e "require.resolve('@tokenscout/extract')" 2>/dev/null && echo OK || echo MISSING
```

If MISSING:
```bash
npm install --save-dev @tokenscout/extract playwright
npx playwright install chromium --with-deps
```

Also check for `@tokenscout/transform` (needed for --format css-vars/tailwind):
```bash
node -e "require.resolve('@tokenscout/transform')" 2>/dev/null && echo OK || echo MISSING
```

If MISSING and FORMAT is not "dtcg":
```bash
npm install --save-dev @tokenscout/transform
```

## Step 2: Run extraction

Create a session-unique working directory, then write and run the extraction script:

```bash
TSDIR=$(mktemp -d)
```

```javascript
// $TSDIR/run.mjs
import { inspectSite } from "@tokenscout/extract";

const opts = {
  breakpoints: [1440, 768, 390],
  deltaE: 12,
};

// --quick: skip icons, topology, assets (faster, tokens + stack only)
if (process.env.QUICK === "1") {
  Object.assign(opts, { icons: false, topology: false, assets: false, animations: false });
}

const report = await inspectSite(process.env.TARGET_URL, opts);
process.stdout.write(JSON.stringify(report, null, 2));
```

```bash
TARGET_URL="$URL" QUICK="$QUICK" node "$TSDIR/run.mjs" > "$TSDIR/report.json"
```

## Step 3: Format conversion (if requested)

If FORMAT is "css-vars" or "tailwind", convert via `@tokenscout/transform`:

```javascript
// $TSDIR/convert.mjs
import { transform } from "@tokenscout/transform";
import { readFileSync } from "node:fs";

const { tokens } = JSON.parse(readFileSync(process.env.TSDIR + "/report.json", "utf-8"));
const out = transform(tokens, process.env.FORMAT);
process.stdout.write(typeof out === "string" ? out : JSON.stringify(out, null, 2));
```

```bash
TSDIR="$TSDIR" FORMAT="$FORMAT" node "$TSDIR/convert.mjs" > "$TSDIR/output.txt"
```

## Step 4: Present results

If FORMAT is "css-vars" or "tailwind", read `$TSDIR/output.txt` and present it first as a fenced code block: that is the primary output the user asked for.

Read `$TSDIR/report.json` for the structured summary below:

### Color palette
List the top clusters from `report.tokens.color`. For each:
- Show the `$value` as a colour swatch approximation in text (e.g. `■ #3b82f6: blue-500-ish · 14 elements · background-color, color`)
- Note cluster size (`$extensions["com.tokenscout.member-count"]`) and usage roles (`$extensions["com.tokenscout.css-properties"]`)

### Type scale
List `report.tokens["font-size"]` entries as sorted sizes. Note the detected modular ratio if `$extensions` carries one.

### Spacing grid
List `report.tokens.spacing` entries. Note the GCD base unit.

### Animation model
From `report.animations`:
- Durations and easings used
- Any perf-smell flags (layout/paint properties animated)
- `reducedMotion.gap` = true → warn the user this site has no `prefers-reduced-motion` guard

### Tech stack
From `report.stack`: framework, confidence, evidence.

### Page topology (skip if QUICK=1)
From `report.topology.sections`: list section tags, positions, sticky/fixed/full-screen flags.

### Icons (skip if QUICK=1)
From `report.icons.icons`: count of unique SVGs, list first 5 with viewBox + label.

## Step 5: Visual capture with agent-browser (optional)

If `agent-browser` is available in PATH:
```bash
which agent-browser && echo PRESENT || echo ABSENT
```

If PRESENT, offer the user a screenshot of the live page alongside the token output:
```bash
agent-browser open "$URL"
agent-browser wait --load networkidle
agent-browser screenshot --full "$TSDIR/screenshot.png"
agent-browser close
```

Useful for cloning workflows: the screenshot is the visual ground truth, the tokens are the numerical spec.

## Step 6: Suggest next steps

Based on what was extracted, suggest:

1. **Start cloning**: "I have the full token set. Want me to scaffold a Next.js + Tailwind project using these tokens?"
2. **Export to Tailwind**: "Run `/tokenscout $URL --format tailwind` to get a drop-in `tailwind.config.js`."
3. **Export to CSS vars**: "Run `/tokenscout $URL --format css-vars` for a `:root { --color-... }` block."
4. **Animation audit**: if `reducedMotion.gap` is true: "This site has animations but no `prefers-reduced-motion` guard: a WCAG 2.3.3 gap."
5. **Interaction model**: if topology found scroll-driven sections: "The hero appears to be scroll-driven. Want me to run `detectInteractionModel` on specific sections?"

## MCP mode (Claude Code / Cursor / Windsurf)

If `@tokenscout/mcp` is installed, users can wire it as an MCP server instead of running scripts:

```json
// .claude/settings.json or ~/.cursor/mcp.json
{
  "mcpServers": {
    "tokenscout": {
      "command": "npx",
      "args": ["@tokenscout/mcp"],
      "env": {}
    }
  }
}
```

This exposes `inspect_site` and `extract_tokens` as native tools, letting Claude call them directly without shell scripts.

## Error handling

- **Playwright install missing**: Run `npx playwright install chromium`
- **Bot detection / 403**: Some sites block headless. Try `agent-browser open "$URL"` first: if it loads, run the extraction inside that session via `agent-browser eval`
- **Timeout**: Add `--timeout 60000` to the inspectSite options
- **0 colors / empty tokens**: The site may use CSS custom properties not resolvable at paint time. Note this to the user and suggest inspecting `report.tokens.color.$extensions.unanalyzable`
