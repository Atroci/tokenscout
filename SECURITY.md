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

The `tokenscout` core is a zero-runtime-dependency TypeScript library. It
performs pure token reduction over values you pass in and makes no network or
filesystem calls. `@tokenscout/extract` is the browser boundary: it navigates
consumer-supplied URLs, reads rendered pages, can download discovered assets,
and can write study artifacts. It holds no credentials itself. Relevant report
classes include:

- correctness bugs that could be triggered into a crash or hang by crafted
  input (e.g. a malformed color string causing unbounded work),
- unsafe URL handling, path traversal, or unintended file writes in the
  extractor, asset downloader, screenshot capture, or study bundle.

## Network safety in `@tokenscout/extract`

`@tokenscout/extract` navigates and fetches URLs it did not choose: the target
the caller supplied, same-origin links discovered on that page, sitemap
`<loc>` entries (not origin-constrained), and asset URLs harvested from the
rendered DOM. Every one of those is untrusted input, so every network-reaching
call site — page navigation, sitemap fetches, and asset downloads — validates
its target through `assertPublicHttpUrl()` (`packages/extract/src/url-safety.ts`)
before the request goes out:

- **Blocked:** loopback, private (RFC 1918), link-local (including the
  169.254.169.254 cloud-metadata address), carrier-grade NAT (RFC 6598), and
  other non-public IPv4/IPv6 ranges — checked against every address the
  hostname resolves to, and against IPv4-mapped IPv6 by its embedded address,
  not just the literal hostname string.
- **Passed through unchecked:** non-http(s) schemes (`file:`, used by this
  repository's own local-fixture tests), since they never reach the network.
- **Failure mode:** a blocked sitemap or asset URL fails soft (the existing
  fetch-error contract for those functions — see `sitemap.ts` and
  `download-assets.ts`); a blocked page-navigation target throws
  `UnsafeUrlError`.

**Known limitation.** The check runs once, before the request (DNS resolved
and validated at call time). It does not intercept a mid-navigation redirect
inside Chromium, and it does not defend against DNS rebinding between this
check and the actual TCP connection. Closing that gap fully would need
request-level interception (Playwright `page.route()` / a validating proxy) on
every hop, not just the initial target — tracked as a ROADMAP follow-up, not
implemented here. Treat this guard as a real but partial mitigation, the same
scope as the `assertPublicUrl` check it is modeled on in
[ion-design/ditto.site](https://github.com/ion-design/ditto.site)'s hosted
clone endpoint (`packages/api/src/ssrf.ts` there): validated at the point of
request, not proxied end-to-end.

## Supply chain

- Zero runtime dependencies is an intentional guarantee of the core package.
  Browser weight stays in `@tokenscout/extract`, with Playwright as a peer
  dependency owned by the consumer.
- The lockfile (`package-lock.json`) is committed.
- Releases are published with npm **provenance** so the published tarball can
  be traced to the exact source commit and build workflow. Verify with
  `npm audit signatures` after install.
