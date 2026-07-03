// Pure mapping tests for profileStack(). No browser. Run via tsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { profileStack, type RawStackSignals } from "../src/profile-stack.js";

/** Empty baseline: every field present but signalling nothing. */
function empty(): RawStackSignals {
  return {
    globals: [],
    generator: null,
    scriptSrcs: [],
    domMarkers: [],
    ngVersion: null,
    cssModulesClassCount: 0,
  };
}

test("profileStack: Next.js page (__NEXT_DATA__ + #__next) is high, implies React", () => {
  const profile = profileStack({
    ...empty(),
    globals: ["__NEXT_DATA__", "React", "ReactDOM"],
    domMarkers: ["#__next"],
    scriptSrcs: ["https://site.test/_next/static/chunks/main.js"],
  });

  const next = profile.frameworks.find((f) => f.name === "Next.js");
  const react = profile.frameworks.find((f) => f.name === "React");
  assert.equal(next?.confidence, "high");
  // React rides along Next.js at high, not the weaker global-only medium.
  assert.equal(react?.confidence, "high");
  // Sorted by name: Next.js before React.
  assert.deepEqual(
    profile.frameworks.map((f) => f.name),
    ["Next.js", "React"],
  );
  assert.equal(profile.generator, null);
});

test("profileStack: WordPress page (generator + /wp-content/) is high", () => {
  const profile = profileStack({
    ...empty(),
    generator: "WordPress 6.5",
    scriptSrcs: ["https://blog.test/wp-content/themes/x/app.js"],
    globals: ["wp"],
  });

  const wp = profile.frameworks.find((f) => f.name === "WordPress");
  assert.equal(wp?.confidence, "high");
  assert.equal(profile.generator, "WordPress 6.5");
  // Only one framework, even though three separate signals matched.
  assert.deepEqual(
    profile.frameworks.map((f) => f.name),
    ["WordPress"],
  );
});

test("profileStack: plain static page detects nothing", () => {
  const profile = profileStack(empty());
  assert.deepEqual(profile.frameworks, []);
  assert.equal(profile.generator, null);
  assert.deepEqual(profile.evidence, []);
});

test("profileStack: Angular page (ng-version) is high", () => {
  const profile = profileStack({
    ...empty(),
    ngVersion: "17.1.0",
    domMarkers: ["ng-version"],
    globals: ["ng"],
  });

  const ng = profile.frameworks.find((f) => f.name === "Angular");
  assert.equal(ng?.confidence, "high");
  assert.deepEqual(
    profile.frameworks.map((f) => f.name),
    ["Angular"],
  );
  // Evidence cites the actual version, not the bare global fallback.
  assert.ok(profile.evidence.some((e) => e.includes("17.1.0")));
});

test("profileStack: bare React global without a root marker is medium", () => {
  const profile = profileStack({ ...empty(), globals: ["React"] });
  const react = profile.frameworks.find((f) => f.name === "React");
  assert.equal(react?.confidence, "medium");
});

test("profileStack: bare ng global without ng-version is medium", () => {
  const profile = profileStack({ ...empty(), globals: ["ng"] });
  const ng = profile.frameworks.find((f) => f.name === "Angular");
  assert.equal(ng?.confidence, "medium");
});

test("profileStack: Shopify via CDN script url is high", () => {
  const profile = profileStack({
    ...empty(),
    scriptSrcs: ["https://cdn.shopify.com/s/files/1/x/theme.js"],
  });
  const shopify = profile.frameworks.find((f) => f.name === "Shopify");
  assert.equal(shopify?.confidence, "high");
});

test("profileStack: Nuxt implies Vue at high, Gatsby implies React at high", () => {
  const nuxt = profileStack({ ...empty(), globals: ["__NUXT__"] });
  assert.equal(
    nuxt.frameworks.find((f) => f.name === "Nuxt")?.confidence,
    "high",
  );
  assert.equal(
    nuxt.frameworks.find((f) => f.name === "Vue")?.confidence,
    "high",
  );

  const gatsby = profileStack({ ...empty(), globals: ["___gatsby"] });
  assert.equal(
    gatsby.frameworks.find((f) => f.name === "Gatsby")?.confidence,
    "high",
  );
  assert.equal(
    gatsby.frameworks.find((f) => f.name === "React")?.confidence,
    "high",
  );
});

test("profileStack: SvelteKit payload implies Svelte at high", () => {
  const profile = profileStack({
    ...empty(),
    globals: ["__SVELTEKIT_PAYLOAD__"],
  });
  assert.equal(
    profile.frameworks.find((f) => f.name === "SvelteKit")?.confidence,
    "high",
  );
  assert.equal(
    profile.frameworks.find((f) => f.name === "Svelte")?.confidence,
    "high",
  );
});

test("profileStack: Next.js App Router (no __NEXT_DATA__/#__next) is detected via /_next/static/ script src", () => {
  // App Router renders neither __NEXT_DATA__ nor #__next, unlike Pages Router.
  const profile = profileStack({
    ...empty(),
    scriptSrcs: ["https://site.test/_next/static/chunks/app/page.js"],
  });
  const next = profile.frameworks.find((f) => f.name === "Next.js");
  assert.equal(next?.confidence, "high");
  assert.equal(
    profile.frameworks.find((f) => f.name === "React")?.confidence,
    "high",
  );
});

test("profileStack: CSS Modules hash-class pattern is medium at 3+ distinct matches", () => {
  const profile = profileStack({ ...empty(), cssModulesClassCount: 3 });
  assert.equal(
    profile.frameworks.find((f) => f.name === "CSS Modules")?.confidence,
    "medium",
  );
});

test("profileStack: CSS Modules below the 3-match threshold is not reported", () => {
  const profile = profileStack({ ...empty(), cssModulesClassCount: 2 });
  assert.equal(
    profile.frameworks.find((f) => f.name === "CSS Modules"),
    undefined,
  );
});

test("profileStack: high beats a later medium for the same framework", () => {
  // data-reactroot (high) seen before the React global (medium) must stay high.
  const profile = profileStack({
    ...empty(),
    domMarkers: ["[data-reactroot]"],
    globals: ["React"],
  });
  assert.equal(
    profile.frameworks.find((f) => f.name === "React")?.confidence,
    "high",
  );
});
