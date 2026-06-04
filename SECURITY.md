# Security Policy

## Supported Versions

tokenscout is pre-1.0. Only the latest published `0.x` release receives
security fixes. Once `1.0.0` ships, this table will track the current major.

| Version | Supported |
| ------- | ------------------ |
| latest `0.x` | :white_check_mark: |
| older    | :x:                |

## Reporting a Vulnerability

**Please do not open a public issue for a security vulnerability.**

Report it privately through GitHub's **Private Vulnerability Reporting**:

- Go to <https://github.com/Atroci/tokenscout/security/advisories/new>

If you cannot use GitHub, email **hugo@vizuh.com** with `tokenscout security`
in the subject.

Please include:

- a description of the issue and its impact,
- steps to reproduce (a minimal input or snippet is ideal),
- the affected version.

### What to expect

This is a solo-maintained project, so timelines are best-effort:

- **Acknowledgement** within 7 days.
- **Assessment and a fix or mitigation plan** within 30 days for confirmed
  issues.
- Credit in the release notes once a fix ships, unless you prefer to stay
  anonymous.

Please allow a reasonable window for a fix before any public disclosure.

## Scope

tokenscout is a zero-runtime-dependency TypeScript library. It performs pure
color math (sRGB to CIELAB, ΔE, clustering) over values you pass in. It makes
no network calls, reads no files, and holds no secrets or credentials. The
most relevant classes of report are therefore:

- correctness bugs that could be triggered into a crash or hang by crafted
  input (e.g. a malformed color string causing unbounded work),
- any future surface (planned: headless crawl / computed-style extraction)
  that touches the network or the filesystem.

## Supply chain

- Zero runtime dependencies is an intentional security guarantee.
  Consumers inherit no transitive runtime risk. Adding a runtime dependency
  is treated as a security-relevant change, not a routine one.
- The lockfile (`package-lock.json`) is committed.
- Releases are published with npm **provenance** so the published tarball can
  be traced to the exact source commit and build workflow. Verify with
  `npm audit signatures` after install.
