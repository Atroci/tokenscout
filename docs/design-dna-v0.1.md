# DesignDNA v0.1

The `studySite` API turns TokenScout's measured `SiteReport` into a conservative,
portable part of an evidence-backed redesign baseline. A study writes:

- site-report.json — raw measured evidence
- design-dna.json — the versioned machine-readable contract
- design-dna.md — a readable implementation brief
- evidence/ — light/dark screenshots plus the capture manifest

The contract separates observed, inferred, and unknown knowledge. Transfer
guidance is separately classified as keep, adapt, improve, or doNotCopy. Every
evidence-derived claim carries confidence and a pointer back to its source.

Usage:

    import { studySite } from "@tokenscout/extract";

    await studySite("https://example.com", {
      outDir: "./tokenscout-study",
      breakpoints: [1440, 768, 390],
    });

v0.1 does not claim to identify human authorship, semantic token roles,
component boundaries, or complete UI states. Those remain explicit unknowns
until TokenScout captures evidence capable of supporting them.
