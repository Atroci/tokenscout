# Contributing to tokenscout

Thanks for your interest. tokenscout is a TypeScript workspace for studying
undocumented live client websites as evidence-backed redesign baselines. Its
core package stays **zero-runtime-dependency**; browser work and output
transforms live separately.

## Ground rules

- **Zero runtime dependencies in core.** The `tokenscout` package must not add a
  `dependencies` entry. Browser work belongs in `@tokenscout/extract`, with
  Playwright kept as a peer dependency.
- **ESM + TypeScript, Node 20+.** Source is `.ts`, output is ESM in `dist/`.
- **Pure functions where possible.** The color math is deliberately small and
  side-effect free; keep new primitives in the same spirit.
- **Small, focused PRs.** One change per PR. Easier to review, easier to ship.

## Development

```bash
git clone https://github.com/Atroci/tokenscout.git
cd tokenscout
npm ci
npm run lint
npm run typecheck
npm test
```

The public agent skill lives in [`skills/tokenscout`](./skills/tokenscout).
Keep `SKILL.md` agent-agnostic, limited to capabilities that exist in this
repository, and free of machine-local paths or unpublished package claims.
Keep its frontmatter to `name` and `description`, and update
`agents/openai.yaml` whenever the public invocation or promise changes.

## Pull request process

1. Fork and branch from `main`.
2. Make your change. Keep it surgical: don't reformat unrelated code.
3. Ensure `npm run typecheck` and `npm run build` pass.
4. Use [Conventional Commits](https://www.conventionalcommits.org/) for the PR
   title (e.g. `feat: add deltaE2000`, `fix: clamp Lab L*`).
5. Add a line under `## [Unreleased]` in `CHANGELOG.md` describing the change.
6. Open the PR and fill in the template.

## Good first contributions

Areas where help is especially welcome:

- Color science: additional ΔE formulas (ΔE2000), better cluster canonicalization.
- CSS value parsing: `color()` support and better out-of-gamut mapping.
- Evidence-backed semantic token roles without guessing intent.
- Responsive and motion capture with focused browser fixtures.

## Working against upstream projects

The `_upstreams/` directory (gitignored) is scratch space for cloning adjacent
OSS projects to study and prepare contributions against. See
[`_upstreams/README.md`](./_upstreams/README.md) for the workflow. Nothing
cloned there is ever committed into tokenscout.

## Reporting bugs / requesting features

Use the issue templates. For color-math bugs, please include the input value(s)
and the expected vs actual output. It makes reproduction trivial.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By
participating you agree to uphold it.
