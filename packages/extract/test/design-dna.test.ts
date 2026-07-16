import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assembleTokens } from "tokenscout/tokens";
import type { PageExtract } from "tokenscout/schema";
import {
  buildDesignDNA,
  renderDesignDNAMarkdown,
  studySite,
  type SiteReport,
} from "../dist/index.js";

const pages: PageExtract[] = [
  {
    url: "https://studio.example/",
    breakpoint: 1440,
    colors: [
      { value: "#ffffff", role: "background-color", count: 20 },
      { value: "#111111", role: "color", count: 16 },
      { value: "#777777", role: "color", count: 4 },
    ],
    type: {
      sizes: ["16px", "32px"],
      families: ["Inter, sans-serif"],
      weights: ["400", "700"],
    },
    spacing: { values: ["8px", "16px", "32px"] },
  },
  {
    url: "https://studio.example/",
    breakpoint: 390,
    colors: [
      { value: "#ffffff", role: "background-color", count: 20 },
      { value: "#111111", role: "color", count: 16 },
    ],
    type: { sizes: ["16px", "28px"], families: ["Inter, sans-serif"] },
    spacing: { values: ["8px", "16px", "24px"] },
  },
];

const report: SiteReport = {
  url: "https://studio.example/",
  pages,
  tokens: assembleTokens(pages),
  assets: { assets: [] },
  animations: {
    durations: [200, 500],
    easings: ["cubic-bezier(0.2, 0, 0, 1)"],
    keyframes: ["reveal"],
    properties: { composited: ["opacity"], paint: [], layout: ["width"] },
    reducedMotion: { declared: false, gap: true },
  },
  stack: {
    frameworks: [{ name: "React", confidence: "high" }],
    generator: null,
    evidence: ["React fixture"],
  },
  icons: { icons: [] },
  topology: {
    count: 3,
    hasScrollSnap: false,
    sections: [
      {
        index: 0,
        tag: "header",
        id: null,
        classes: "site-header",
        role: "header",
        position: "sticky",
        zIndex: "10",
        isFixed: false,
        isSticky: true,
        height: 72,
        isFullScreen: false,
      },
      {
        index: 1,
        tag: "main",
        id: "work",
        classes: "portfolio",
        role: "main",
        position: "static",
        zIndex: "auto",
        isFixed: false,
        isSticky: false,
        height: 800,
        isFullScreen: true,
      },
      {
        index: 2,
        tag: "footer",
        id: null,
        classes: "site-footer",
        role: "footer",
        position: "static",
        zIndex: "auto",
        isFixed: false,
        isSticky: false,
        height: 200,
        isFullScreen: false,
      },
    ],
  },
  interaction: {
    type: "scroll-driven",
    confidence: "medium",
    mechanism: "position:sticky",
  },
};

test("buildDesignDNA separates evidence, inference, unknowns, and policy", () => {
  const dna = buildDesignDNA(
    report,
    [
      {
        url: report.url,
        captures: [
          { theme: "light", screenshot: "studio-light.png", motion: [] },
        ],
      },
    ],
    { studiedAt: "2026-07-13T12:00:00.000Z" },
  );

  assert.equal(dna.schemaVersion, "0.1");
  assert.equal(dna.source.studiedAt, "2026-07-13T12:00:00.000Z");
  assert.deepEqual(dna.evidence.screenshots, ["evidence/studio-light.png"]);
  assert.ok(
    dna.knowledge.observed.every((finding) => finding.evidence.length > 0),
  );
  assert.ok(
    dna.knowledge.inferred.some(
      (finding) => finding.id === "inferred.spacing-rhythm",
    ),
  );
  assert.ok(
    dna.knowledge.unknown.some(
      (finding) => finding.id === "unknown.authorship",
    ),
  );
  assert.ok(
    dna.transfer.improve.some(
      (guidance) => guidance.id === "improve.reduced-motion",
    ),
  );
  assert.ok(
    dna.transfer.improve.some(
      (guidance) => guidance.id === "improve.motion-performance",
    ),
  );
  assert.equal(dna.transfer.doNotCopy.length, 3);
});

test("renderDesignDNAMarkdown exposes the builder decision boundary", () => {
  const markdown = renderDesignDNAMarkdown(
    buildDesignDNA(report, [], {
      studiedAt: "2026-07-13T12:00:00.000Z",
    }),
  );

  for (const heading of [
    "## Observed",
    "## Inferred",
    "## Unknown",
    "## Keep",
    "## Adapt",
    "## Improve",
    "## Do not copy",
  ]) {
    assert.match(markdown, new RegExp(heading));
  }
  assert.match(markdown, /unknown\.authorship/);
  assert.match(markdown, /do-not-copy\.pixel-clone/);
});

test("studySite writes the versioned study bundle for a rendered fixture", async () => {
  const fixture = pathToFileURL(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample.html"),
  ).href;
  const outDir = await mkdtemp(join(tmpdir(), "tokenscout-study-"));

  try {
    const result = await studySite(fixture, {
      outDir,
      breakpoints: [1280, 375],
      screenshots: false,
      studiedAt: "2026-07-13T12:00:00.000Z",
    });
    const savedReport = JSON.parse(
      await readFile(join(outDir, "site-report.json"), "utf8"),
    ) as SiteReport;
    const savedDNA = JSON.parse(
      await readFile(join(outDir, "design-dna.json"), "utf8"),
    ) as { schemaVersion: string };
    const savedMarkdown = await readFile(join(outDir, "design-dna.md"), "utf8");

    assert.equal(savedReport.url, fixture);
    assert.equal(savedDNA.schemaVersion, "0.1");
    assert.match(savedMarkdown, /# Design DNA v0\.1/);
    assert.deepEqual(result.designDNA.evidence.screenshots, []);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
