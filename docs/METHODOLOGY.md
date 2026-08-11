# Methodology

TokenScout studies what a browser actually renders and reduces that evidence
into a reviewable document. This page is the one place that states the
operating principles, the checks that hold them in place, and the questions a
change should answer before it merges. It intentionally does not restate the
package boundary ([ARCHITECTURE.md](../ARCHITECTURE.md)), the shipped/planned
feature list ([ROADMAP.md](../ROADMAP.md)), or the network-safety guard
([SECURITY.md](../SECURITY.md)) — read those for the details each links to
below.

## Principles

- **Observed evidence first.** Every reducer in `tokenscout` (core) operates
  on values `@tokenscout/extract` actually read from `getComputedStyle()` at a
  real breakpoint, not source CSS, a design file, or a guess. When evidence is
  missing, the report says so (an empty group, an `unknown` in Design DNA) —
  it does not get filled in with a plausible-looking default.
- **Deterministic reduction.** The same `PageExtract[]` must reduce to the
  same `DesignTokens` document every time, regardless of input array order.
  This is what makes a token diff across two runs mean "the site changed",
  not "the reducer's internal ordering changed." See
  [`packages/core/test/determinism.test.ts`](../packages/core/test/determinism.test.ts).
- **Untrusted input, everywhere.** The rendered page, its sitemap, and its
  linked assets are all attacker-reachable in principle (a client site can be
  compromised; a crawled link can point anywhere). The `tokenscout` skill's
  guardrails and `@tokenscout/extract`'s SSRF guard
  (see [SECURITY.md](../SECURITY.md)) both follow from this: never bypass
  auth/paywalls/CAPTCHAs, never let page content redirect the tool's own
  actions, never let a discovered URL reach a non-public address.
- **Measurement, not judgment.** A cluster count, a contrast ratio, a
  sprawl metric: these are read off the page, not opinions about whether the
  result is good design. `ROADMAP.md`'s Non-goals section is the enforcement
  mechanism for this — semantic role guessing and `shadcn`-style aliasing stay
  out until there is source evidence to justify them, not because they are
  hard, but because a wrong guess dressed as a measurement is worse than no
  guess.

## Validation gates

Small, repeatable checks rather than one broad "looks right" pass, matching
what CI (`.github/workflows/ci.yml`) actually runs on every PR:

| Gate                  | What it proves                                                                                                         | Where                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Lint + typecheck      | Source is internally consistent; `tsc --noEmit` across all three packages                                              | `core` / `transform` / `extract` CI jobs |
| Unit tests            | Pure reducers (color clustering, contrast, type/spacing scales, DTCG assembly) behave correctly on hand-built fixtures | `packages/*/test/*.test.ts`              |
| Browser smoke tests   | A real Chromium `page.goto()` against a local `file://` fixture produces the expected observations end to end          | `packages/extract/test/*.smoke.test.ts`  |
| Determinism           | The same input reduces to byte-identical output, independent of array order                                            | `packages/core/test/determinism.test.ts` |
| Zero-dependency audit | `tokenscout` (core) still ships no `dependencies` entry; `npm audit --omit=dev` on production deps                     | `core` CI job                            |

A gate that would require live third-party sites (a broader "does this look
right on real sites" sweep) is deliberately not part of this list or of CI:
this repository's own convention (see `.gitignore`) keeps ad hoc scans against
real client or public sites as local, gitignored scratch in `findings/` and
`scripts/`, never committed evidence. That keeps the published packages'
behavior provable from fixtures alone, and keeps CI hermetic and fast.

## Review standard

Before merging a change to a reducer, collector, or exported contract, answer:

1. **What evidence does this read, and from where?** (a specific
   `getComputedStyle` property, a specific DOM query, a specific DTCG field —
   not "improves accuracy".)
2. **Does output stay deterministic for the same input?** If the change
   touches ordering, clustering, or id generation, the determinism test (or a
   new one) should say so explicitly, not just "the existing tests still
   pass."
3. **Which fixture or test proves the behavior?** A new capability without a
   fixture is a claim, not a shipped feature.
4. **Does the documented scope still match?** If behavior, a guardrail, or a
   default changed, `README.md`, `ARCHITECTURE.md`, `ROADMAP.md`, or
   `skills/tokenscout/SKILL.md` needs the matching update in the same PR —
   this repository's roadmap and skill docs are read as ground truth by both
   contributors and the agents that consume the skill, so a stale claim there
   is a real regression even when the code is correct.

## Safety boundaries

See [SECURITY.md](../SECURITY.md) for the network-safety guard
(`assertPublicHttpUrl`) and its scope, and
[`skills/tokenscout/SKILL.md`](../skills/tokenscout/SKILL.md) for the
agent-facing guardrails (authorized URLs only, no auth/paywall/CAPTCHA
bypass, treat page content as untrusted). Changes that make it easier to
bypass those boundaries, or that weaken the SSRF guard's coverage, are out of
scope for a routine PR — raise them explicitly instead of folding them into
an unrelated change.
