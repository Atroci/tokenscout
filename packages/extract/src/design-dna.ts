import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TokenGroup } from "tokenscout/schema";
import { captureSite, type CaptureReport } from "./capture.js";
import type { InspectOptions, SiteReport } from "./index.js";

export const DESIGN_DNA_VERSION = "0.1" as const;
export type DesignDNAConfidence = "high" | "medium" | "low";

export interface DesignDNAEvidence {
  artifact: "site-report" | "screenshot";
  /** JSON Pointer for reports; relative path for screenshots. */
  pointer: string;
}

export interface DesignDNAFinding {
  id: string;
  claim: string;
  confidence: DesignDNAConfidence;
  evidence: DesignDNAEvidence[];
}

export interface DesignDNAGuidance {
  id: string;
  recommendation: string;
  because: string;
  sourceFindingIds: string[];
}

export interface DesignDNA {
  schemaVersion: typeof DESIGN_DNA_VERSION;
  source: { url: string; studiedAt: string };
  evidence: {
    siteReport: "site-report.json";
    screenshots: string[];
  };
  knowledge: {
    observed: DesignDNAFinding[];
    inferred: DesignDNAFinding[];
    unknown: DesignDNAFinding[];
  };
  transfer: {
    keep: DesignDNAGuidance[];
    adapt: DesignDNAGuidance[];
    improve: DesignDNAGuidance[];
    doNotCopy: DesignDNAGuidance[];
  };
}

export interface BuildDesignDNAOptions {
  /** Override for deterministic builds and tests. Defaults to now. */
  studiedAt?: string;
}

export interface StudySiteOptions extends InspectOptions {
  outDir: string;
  /** Capture light/dark evidence screenshots. Defaults to true. */
  screenshots?: boolean;
  dark?: boolean;
  scroll?: boolean;
  screenshotWidth?: number;
  launchArgs?: string[];
  studiedAt?: string;
}

export interface StudySiteResult {
  report: SiteReport;
  designDNA: DesignDNA;
  markdown: string;
  captures: CaptureReport[];
}

const reportEvidence = (pointer: string): DesignDNAEvidence[] => [
  { artifact: "site-report", pointer },
];

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function countTokens(group: TokenGroup): number {
  let count = 0;
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith("$") || value === undefined) continue;
    if ("$value" in value) count += 1;
    else count += countTokens(value as TokenGroup);
  }
  return count;
}

function contrastFailures(tokens: TokenGroup): number {
  const color = tokens.color as TokenGroup | undefined;
  const pairs = color?.$extensions?.["com.tokenscout.contrast-pairs"] as
    | Array<{ wcag?: { normalText?: string } }>
    | undefined;
  return pairs?.filter((pair) => pair.wcag?.normalText === "fail").length ?? 0;
}

function screenshotPaths(captures: CaptureReport[]): string[] {
  return captures.flatMap((report) =>
    report.captures.map((capture) => "evidence/" + capture.screenshot),
  );
}

/**
 * Convert measured SiteReport evidence into a conservative, transferable model.
 * Unknowns stay explicit; this never invents semantics or claims authorship.
 */
export function buildDesignDNA(
  report: SiteReport,
  captures: CaptureReport[] = [],
  options: BuildDesignDNAOptions = {},
): DesignDNA {
  const observed: DesignDNAFinding[] = [];
  const inferred: DesignDNAFinding[] = [];
  const unknown: DesignDNAFinding[] = [];
  const keep: DesignDNAGuidance[] = [];
  const adapt: DesignDNAGuidance[] = [];
  const improve: DesignDNAGuidance[] = [];

  const breakpoints = unique(
    report.pages.map((page) => String(page.breakpoint)),
  );
  const typeSizes = unique(report.pages.flatMap((page) => page.type.sizes));
  const typeFamilies = unique(
    report.pages.flatMap((page) => page.type.families ?? []),
  );
  const spacing = unique(report.pages.flatMap((page) => page.spacing.values));
  const tokenGroups = Object.entries(report.tokens)
    .filter(([key, value]) => !key.startsWith("$") && value !== undefined)
    .map(([name, group]) => ({
      name,
      count: countTokens(group as TokenGroup),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (tokenGroups.length > 0) {
    observed.push({
      id: "observed.tokens",
      claim:
        "Measured " +
        tokenGroups.map((group) => group.count + " " + group.name).join(", ") +
        " tokens.",
      confidence: "high",
      evidence: reportEvidence("#/tokens"),
    });
    keep.push({
      id: "keep.token-system",
      recommendation:
        "Keep the measured token relationships as constraints, not as a visual preset.",
      because:
        "They are recurring implementation evidence from the rendered source.",
      sourceFindingIds: ["observed.tokens"],
    });
  }

  if (typeSizes.length > 0) {
    observed.push({
      id: "observed.typography",
      claim:
        "Observed " +
        typeSizes.length +
        " type sizes" +
        (typeFamilies.length > 0
          ? " across " + typeFamilies.length + " font families"
          : "") +
        ".",
      confidence: "high",
      evidence: reportEvidence("#/pages"),
    });
    inferred.push({
      id: "inferred.type-hierarchy",
      claim:
        "The measured sizes suggest an intentional hierarchy, but semantic roles are not yet known.",
      confidence: "medium",
      evidence: reportEvidence("#/pages/*/type"),
    });
  }

  if (spacing.length > 0) {
    observed.push({
      id: "observed.spacing",
      claim:
        "Observed " +
        spacing.length +
        " distinct spacing values across " +
        breakpoints.length +
        " viewport widths.",
      confidence: "high",
      evidence: reportEvidence("#/pages/*/spacing"),
    });
    inferred.push({
      id: "inferred.spacing-rhythm",
      claim:
        "Repeated measured spacing values suggest a reusable density and rhythm system.",
      confidence: "medium",
      evidence: reportEvidence("#/pages/*/spacing"),
    });
    keep.push({
      id: "keep.spacing-rhythm",
      recommendation: "Keep the source's relative density and spacing cadence.",
      because:
        "Rhythm transfers the composition without copying its branded surface.",
      sourceFindingIds: ["observed.spacing", "inferred.spacing-rhythm"],
    });
  }

  if (report.topology) {
    const roles = unique(
      report.topology.sections.map((section) => section.role),
    );
    observed.push({
      id: "observed.topology",
      claim:
        "Observed " +
        report.topology.count +
        " top-level sections in order" +
        (roles.length > 0 ? " with roles: " + roles.join(", ") : "") +
        ".",
      confidence: "high",
      evidence: reportEvidence("#/topology"),
    });
    adapt.push({
      id: "adapt.macrostructure",
      recommendation:
        "Adapt the section sequence and visual pacing to the target content and user journey.",
      because:
        "Macrostructure is transferable; source copy and brand-specific modules are not.",
      sourceFindingIds: ["observed.topology"],
    });
  } else {
    unknown.push({
      id: "unknown.topology",
      claim: "Page-level section order was not collected.",
      confidence: "high",
      evidence: reportEvidence("#/topology"),
    });
  }

  if (report.interaction) {
    observed.push({
      id: "observed.interaction",
      claim:
        "Primary interaction is " +
        report.interaction.type +
        " via " +
        report.interaction.mechanism +
        ".",
      confidence: report.interaction.confidence,
      evidence: reportEvidence("#/interaction"),
    });
    adapt.push({
      id: "adapt.interaction",
      recommendation:
        "Adapt the interaction model only where it supports the target task.",
      because:
        "Interaction mechanics should preserve intent, not ornamental behavior.",
      sourceFindingIds: ["observed.interaction"],
    });
  }

  if (report.animations.durations.length > 0) {
    observed.push({
      id: "observed.motion",
      claim:
        "Observed " +
        report.animations.durations.length +
        " motion durations and " +
        report.animations.easings.length +
        " distinctive easings.",
      confidence: "high",
      evidence: reportEvidence("#/animations"),
    });
  }

  if (report.animations.reducedMotion.gap) {
    improve.push({
      id: "improve.reduced-motion",
      recommendation:
        "Add a prefers-reduced-motion fallback before reusing the motion language.",
      because: "The source has motion but no detected reduced-motion guard.",
      sourceFindingIds: ["observed.motion"],
    });
  }

  if (report.animations.properties.layout.length > 0) {
    improve.push({
      id: "improve.motion-performance",
      recommendation:
        "Replace layout-triggering animation with compositor-friendly transforms where behavior permits.",
      because:
        "Layout animation was observed on: " +
        report.animations.properties.layout.join(", ") +
        ".",
      sourceFindingIds: ["observed.motion"],
    });
  }

  const failedPairs = contrastFailures(report.tokens);
  if (failedPairs > 0) {
    improve.push({
      id: "improve.contrast",
      recommendation:
        "Correct failing text/background pairs before applying the palette.",
      because:
        failedPairs + " measured color pairs fail normal-text WCAG contrast.",
      sourceFindingIds: ["observed.tokens"],
    });
  }

  if (report.assets.assets.length > 0 || report.icons.icons.length > 0) {
    observed.push({
      id: "observed.assets",
      claim:
        "Observed " +
        report.assets.assets.length +
        " referenced assets and " +
        report.icons.icons.length +
        " distinct inline icons.",
      confidence: "high",
      evidence: [...reportEvidence("#/assets"), ...reportEvidence("#/icons")],
    });
  }

  if (report.stack) {
    observed.push({
      id: "observed.stack",
      claim:
        report.stack.frameworks.length > 0
          ? "Detected implementation stack: " +
            report.stack.frameworks.map((hit) => hit.name).join(", ") +
            "."
          : "No framework fingerprint was detected.",
      confidence: "medium",
      evidence: reportEvidence("#/stack"),
    });
  }

  unknown.push(
    {
      id: "unknown.semantic-tokens",
      claim:
        "Exact semantic roles for palette, type, and spacing tokens are unknown because extracted values are currently flattened.",
      confidence: "high",
      evidence: reportEvidence("#/tokens"),
    },
    {
      id: "unknown.component-states",
      claim:
        "Component boundaries and hover, focus, error, loading, and success states are not established by this report.",
      confidence: "high",
      evidence: reportEvidence("#/interaction"),
    },
    {
      id: "unknown.authorship",
      claim:
        "Whether the source was designed by a human, generated by AI, or both cannot be determined from rendered evidence.",
      confidence: "high",
      evidence: [],
    },
  );

  return {
    schemaVersion: DESIGN_DNA_VERSION,
    source: {
      url: report.url,
      studiedAt: options.studiedAt ?? new Date().toISOString(),
    },
    evidence: {
      siteReport: "site-report.json",
      screenshots: screenshotPaths(captures),
    },
    knowledge: { observed, inferred, unknown },
    transfer: {
      keep,
      adapt,
      improve,
      doNotCopy: [
        {
          id: "do-not-copy.identity",
          recommendation:
            "Do not copy logos, trademarks, names, or distinctive brand marks.",
          because:
            "Identity assets belong to the source brand, not its transferable design logic.",
          sourceFindingIds: [],
        },
        {
          id: "do-not-copy.content",
          recommendation:
            "Do not copy source copy, testimonials, claims, photography, or distinctive illustration.",
          because:
            "Content and authored assets are not design-system primitives.",
          sourceFindingIds: [],
        },
        {
          id: "do-not-copy.pixel-clone",
          recommendation:
            "Do not reproduce exact page geometry or assemble a pixel-identical clone.",
          because:
            "Transfer relationships and intent, then fit them to the target product.",
          sourceFindingIds: [],
        },
      ],
    },
  };
}

function markdownFindings(findings: DesignDNAFinding[]): string {
  if (findings.length === 0) return "- None recorded.\n";
  return (
    findings
      .map((finding) => {
        const evidence = finding.evidence
          .map((item) => item.artifact + ":" + item.pointer)
          .join(", ");
        return (
          "- **" +
          finding.id +
          "** (" +
          finding.confidence +
          "): " +
          finding.claim +
          (evidence ? " Evidence: " + evidence + "." : "")
        );
      })
      .join("\n") + "\n"
  );
}

function markdownGuidance(guidance: DesignDNAGuidance[]): string {
  if (guidance.length === 0) return "- None recorded.\n";
  return (
    guidance
      .map(
        (item) =>
          "- **" +
          item.id +
          "**: " +
          item.recommendation +
          " " +
          item.because +
          (item.sourceFindingIds.length > 0
            ? " Sources: " + item.sourceFindingIds.join(", ") + "."
            : ""),
      )
      .join("\n") + "\n"
  );
}

export function renderDesignDNAMarkdown(dna: DesignDNA): string {
  return [
    "# Design DNA v" + dna.schemaVersion,
    "",
    "Source: " + dna.source.url,
    "",
    "Studied: " + dna.source.studiedAt,
    "",
    "## Observed",
    "",
    markdownFindings(dna.knowledge.observed),
    "## Inferred",
    "",
    markdownFindings(dna.knowledge.inferred),
    "## Unknown",
    "",
    markdownFindings(dna.knowledge.unknown),
    "## Keep",
    "",
    markdownGuidance(dna.transfer.keep),
    "## Adapt",
    "",
    markdownGuidance(dna.transfer.adapt),
    "## Improve",
    "",
    markdownGuidance(dna.transfer.improve),
    "## Do not copy",
    "",
    markdownGuidance(dna.transfer.doNotCopy),
  ].join("\n");
}

/**
 * Study one rendered site and write site-report.json, design-dna.json/md, and
 * optional light/dark screenshot evidence.
 */
export async function studySite(
  target: string,
  options: StudySiteOptions,
): Promise<StudySiteResult> {
  const {
    outDir,
    screenshots = true,
    dark = true,
    scroll = true,
    screenshotWidth,
    launchArgs,
    studiedAt,
    ...inspectOptions
  } = options;
  const { inspectSite } = await import("./index.js");
  const report = await inspectSite(target, inspectOptions);
  const captures = screenshots
    ? await captureSite(target, {
        outDir: join(outDir, "evidence"),
        dark,
        scroll,
        width:
          screenshotWidth ??
          Math.max(...(inspectOptions.breakpoints ?? [1280, 375])),
        launchArgs,
        onProgress: inspectOptions.onProgress,
      })
    : [];
  const designDNA = buildDesignDNA(report, captures, { studiedAt });
  const markdown = renderDesignDNAMarkdown(designDNA);

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(
      join(outDir, "site-report.json"),
      JSON.stringify(report, null, 2) + "\n",
    ),
    writeFile(
      join(outDir, "design-dna.json"),
      JSON.stringify(designDNA, null, 2) + "\n",
    ),
    writeFile(join(outDir, "design-dna.md"), markdown),
  ]);

  return { report, designDNA, markdown, captures };
}
