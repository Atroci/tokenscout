// Zero-new-runtime-dep test suite using node:test. Run via tsx (dev dep).
import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleTokens } from "tokenscout/tokens";
import type { PageExtract } from "tokenscout/schema";
import {
  transform,
  renderCssVars,
  renderTailwindConfig,
} from "../src/index.js";

const pages: PageExtract[] = [
  {
    url: "https://example.com/",
    breakpoint: 1280,
    colors: [
      { value: "#3a7bd5", role: "background-color", count: 40 },
      { value: "#ffffff", role: "color", count: 30 },
    ],
    type: { sizes: ["16px", "32px"] },
    spacing: { values: ["8px", "16px"] },
  },
];

const tokens = assembleTokens(pages);

test("transform: css-vars emits a :root block with one custom property per token", () => {
  const out = transform(tokens, "css-vars");
  assert.match(out, /^:root \{\n/);
  assert.match(out, /\n\}\n$/);
  // fontSize/spacing keys already carry their group name -> no doubling.
  assert.match(out, /--font-size-1: 16px;/);
  assert.match(out, /--font-size-2: 32px;/);
  assert.match(out, /--spacing-1: 8px;/);
  // color keys don't carry a "color-" prefix -> css-vars adds one.
  assert.match(out, /--color-\S+: rgb\(58, 123, 213\);/);
});

test("transform: tailwind emits a theme.extend referencing the css-vars names", () => {
  const out = transform(tokens, "tailwind");
  assert.match(out, /^\/\*\* @type \{import\('tailwindcss'\)\.Config\} \*\/\n/);
  assert.match(out, /module\.exports = \{/);
  // Redundant group prefix stripped from the utility key: "font-size-1" -> "1".
  assert.match(out, /"1": "var\(--font-size-1\)"/);
  assert.match(out, /"var\(--color-\S+\)"/);
});

test("transform: rejects unknown formats", () => {
  assert.throws(() => transform(tokens, "scss" as never), /unsupported format/);
});

test('renderCssVars: called directly, same output as transform(tokens, "css-vars")', () => {
  assert.equal(renderCssVars(tokens), transform(tokens, "css-vars"));
});

test("renderCssVars: skips $-prefixed groups and $-prefixed keys", () => {
  const withMeta = {
    $schema: "https://example.com/dtcg.json",
    fontSize: {
      $description: "not a token, must not be emitted as a var",
      "font-size-1": { $value: { value: 16, unit: "px" }, $type: "dimension" },
    },
  };
  const out = renderCssVars(withMeta as never);
  assert.match(out, /--font-size-1: 16px;/);
  assert.doesNotMatch(out, /\$schema/);
  assert.doesNotMatch(out, /\$description/);
});

test("renderCssVars: an empty token document renders an empty :root block", () => {
  assert.equal(renderCssVars({}), ":root {\n\n}\n");
});

test('renderTailwindConfig: called directly, same output as transform(tokens, "tailwind")', () => {
  assert.equal(renderTailwindConfig(tokens), transform(tokens, "tailwind"));
});

test("renderTailwindConfig: a token group with no THEME_KEY mapping is skipped", () => {
  const unmapped = {
    unknownGroup: {
      foo: { $value: { value: 1, unit: "px" }, $type: "dimension" },
    },
  };
  const out = renderTailwindConfig(unmapped as never);
  assert.doesNotMatch(out, /unknownGroup/);
  assert.doesNotMatch(out, /foo/);
  assert.match(out, /extend: \{\}/);
});
