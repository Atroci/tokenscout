# Contributing to tokenscout

Thanks for your interest. tokenscout is a small, **zero-runtime-dependency**
TypeScript library for extracting design tokens from live, rendered websites.
The first public surface is the perceptual color module.

## Ground rules

- **Zero runtime dependencies.** The published package must not add a single
  runtime dependency. Dev dependencies (TypeScript, test/lint tooling) are
  fine. A PR that adds a `dependencies` entry will be asked to remove it.
- **ESM + TypeScript, Node 20+.** Source is `.ts`, output is ESM in `dist/`.
- **Pure functions where possible.** The color math is deliberately small and
  side-effect free; keep new primitives in the same spirit.
- **Small, focused PRs.** One change per PR. Easier to review, easier to ship.

## Development

```bash
git clone https://github.com/Atroci/tokenscout.git
cd tokenscout
npm ci
npm run typecheck   # tsc --noEmit
npm run build       # tsc -> dist/
```

## Pull request process

1. Fork and branch from `main`.
2. Make your change. Keep it surgical — don't reformat unrelated code.
3. Ensure `npm run typecheck` and `npm run build` pass.
4. Use [Conventional Commits](https://www.conventionalcommits.org/) for the PR
   title (e.g. `feat: add deltaE2000`, `fix: clamp Lab L*`).
5. Add a line under `## [Unreleased]` in `CHANGELOG.md` describing the change.
6. Open the PR and fill in the template.

## Good first contributions

This is an open-core project. Areas where help is especially welcome:

- Color science: additional ΔE formulas (ΔE2000), better cluster canonicalization.
- CSS value parsing: more color notations (`hsl()`, `color()`, named colors).
- Token-scale heuristics for the upcoming type and spacing reducers.

## Working against upstream projects

The `_upstreams/` directory (gitignored) is scratch space for cloning adjacent
OSS projects to study and prepare contributions against. See
[`_upstreams/README.md`](./_upstreams/README.md) for the workflow. Nothing
cloned there is ever committed into tokenscout.

## Reporting bugs / requesting features

Use the issue templates. For color-math bugs, please include the input value(s)
and the expected vs actual output — it makes reproduction trivial.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By
participating you agree to uphold it.
