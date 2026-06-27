#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { inspectSite, extractTokens } from "@tokenscout/extract";
import type { InspectOptions, ExtractOptions } from "@tokenscout/extract";

const server = new Server(
  { name: "tokenscout", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "inspect_site",
      description:
        "Extract design tokens (colors, typography, spacing, animation, icons, page topology) from a live URL. Returns a full SiteReport including W3C DTCG tokens, SVG icon manifest, stack profile, page section topology, and asset manifest.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: { type: "string", description: "The URL to inspect" },
          breakpoints: {
            type: "array",
            items: { type: "number" },
            description: "Viewport widths in px. Default [1280, 375].",
          },
          deltaE: {
            type: "number",
            description: "CIELAB ΔE76 clustering threshold for perceptual color grouping. Default 12.",
          },
          assets: {
            type: "boolean",
            description: "Collect asset manifest (images, backgrounds, favicons). Default true.",
          },
          animations: {
            type: "boolean",
            description: "Collect CSS animation tokens with perf-smell classification. Default true.",
          },
          icons: {
            type: "boolean",
            description: "Collect deduplicated SVG icon manifest. Default true.",
          },
          topology: {
            type: "boolean",
            description: "Map page section topology (position, z-index, sticky/full-screen flags). Default true.",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "extract_tokens",
      description:
        "Extract W3C DTCG design tokens only (colors, typography, spacing, animation durations) from a live URL. Lighter than inspect_site — no icons, topology, stack, or asset manifest.",
      inputSchema: {
        type: "object" as const,
        properties: {
          url: { type: "string", description: "The URL to extract tokens from" },
          breakpoints: {
            type: "array",
            items: { type: "number" },
            description: "Viewport widths in px. Default [1280, 375].",
          },
          deltaE: {
            type: "number",
            description: "CIELAB ΔE76 clustering threshold. Default 12.",
          },
        },
        required: ["url"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  if (name !== "inspect_site" && name !== "extract_tokens") {
    throw new Error(`Unknown tool: ${name}`);
  }

  try {
    if (name === "inspect_site") {
      const { url, ...opts } = args as { url: string } & Partial<InspectOptions>;
      if (!url || typeof url !== "string") throw new Error("url is required");
      const report = await inspectSite(url, opts);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
      };
    }

    const { url, ...opts } = args as { url: string } & Partial<ExtractOptions>;
    if (!url || typeof url !== "string") throw new Error("url is required");
    const tokens = await extractTokens(url, opts);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(tokens, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`tokenscout-mcp: startup failed: ${message}\n`);
  process.exit(1);
});
