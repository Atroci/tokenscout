import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { DesignTokens } from "tokenscout/schema";
import { toCssVars } from "../src/css-vars.js";
import { toTailwindConfig } from "../src/tailwind.js";
import { transform } from "../src/index.js";

const TOKENS: DesignTokens = {
  color: {
    "primary-abc": {
      $type: "color",
      $value: { colorSpace: "srgb", components: [0.2, 0.4, 0.8], alpha: 1 },
    },
    "overlay-def": {
      $type: "color",
      $value: { colorSpace: "srgb", components: [0, 0, 0], alpha: 0.5 },
    },
    $extensions: {},
  },
  "font-size": {
    "size-1": { $type: "dimension", $value: { value: 16, unit: "px" } },
  },
  spacing: {
    "step-1": { $type: "dimension", $value: { value: 8, unit: "px" } },
  },
  duration: {
    "dur-1": { $type: "duration", $value: { value: 300, unit: "ms" } },
  },
};

describe("toCssVars", () => {
  it("emits :root block", () => {
    const css = toCssVars(TOKENS);
    assert.ok(css.startsWith(":root {"), "should start with :root {");
    assert.ok(css.includes("--color-primary-abc:"), "should have color var");
    assert.ok(css.includes("rgb(51, 102, 204)"), "solid color as rgb()");
    assert.ok(css.includes("--color-overlay-def:"), "overlay color present");
    assert.ok(css.includes("rgba(0, 0, 0, 0.5)"), "alpha color as rgba()");
    assert.ok(css.includes("--font-size-size-1: 16px"), "font-size var");
    assert.ok(css.includes("--spacing-step-1: 8px"), "spacing var");
    assert.ok(css.includes("--duration-dur-1: 300ms"), "duration var");
    assert.ok(css.endsWith("}"), "should end with }");
  });

  it("skips $extensions meta keys", () => {
    const css = toCssVars(TOKENS);
    assert.ok(!css.includes("$extensions"), "should not include $extensions");
  });
});

describe("toTailwindConfig", () => {
  it("maps color group to theme.extend.colors", () => {
    const config = toTailwindConfig(TOKENS);
    const extend = (config.theme as Record<string, Record<string, Record<string, string>>>).extend;
    assert.ok(extend.colors, "theme.extend.colors present");
    assert.equal(extend.colors["primary-abc"], "#3366cc");
    assert.equal(extend.colors["overlay-def"], "rgba(0, 0, 0, 0.5)");
  });

  it("maps font-size to theme.extend.fontSize", () => {
    const config = toTailwindConfig(TOKENS);
    const extend = (config.theme as Record<string, Record<string, Record<string, string>>>).extend;
    assert.equal(extend.fontSize?.["size-1"], "16px");
  });

  it("maps spacing to theme.extend.spacing", () => {
    const config = toTailwindConfig(TOKENS);
    const extend = (config.theme as Record<string, Record<string, Record<string, string>>>).extend;
    assert.equal(extend.spacing?.["step-1"], "8px");
  });

  it("maps duration to theme.extend.transitionDuration", () => {
    const config = toTailwindConfig(TOKENS);
    const extend = (config.theme as Record<string, Record<string, Record<string, string>>>).extend;
    assert.equal(extend.transitionDuration?.["dur-1"], "300ms");
  });
});

describe("transform", () => {
  it("css-vars dispatches to toCssVars", () => {
    const out = transform(TOKENS, "css-vars");
    assert.ok(typeof out === "string" && out.includes(":root {"));
  });

  it("tailwind dispatches to toTailwindConfig", () => {
    const out = transform(TOKENS, "tailwind");
    assert.ok(typeof out === "object" && out !== null && "theme" in out);
  });

  it("dtcg returns JSON string", () => {
    const out = transform(TOKENS, "dtcg");
    assert.ok(typeof out === "string");
    const parsed = JSON.parse(out as string);
    assert.ok(parsed.color);
  });
});
