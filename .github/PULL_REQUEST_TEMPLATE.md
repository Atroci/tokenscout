## What changed

<!-- Describe the change in one or two sentences. -->

## Why

<!-- Motivation / linked issue. -->

## Checklist

- [ ] `npm run lint`, `npm run typecheck`, and `npm test` pass
- [ ] Core still has zero runtime dependencies; Playwright remains a peer of extract
- [ ] Updated `CHANGELOG.md` under `## [Unreleased]`
- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] If this changes a reducer, collector, or exported contract: the four
      questions in [`docs/METHODOLOGY.md`](../docs/METHODOLOGY.md#review-standard)
      are answered (evidence source, determinism, proving test, doc parity) —
      not just "existing tests still pass"
