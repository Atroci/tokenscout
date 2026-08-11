// Network-safety guard for every http(s) target the extractor reaches:
// page navigation, sitemap fetches, and asset downloads. Blocks loopback,
// private, link-local (including the 169.254.169.254 cloud-metadata address),
// and other non-public IP ranges so a crawled link, a sitemap <loc>, or a
// harvested asset URL cannot turn this process into an SSRF proxy into the
// machine's own network. Inspired by ion-design/ditto.site's `assertPublicUrl`
// guard on its hosted clone endpoint (see SECURITY.md), reimplemented here for
// tokenscout's own boundary: a locally invoked, browser-driving library with
// several independent network-reaching call sites rather than one API intake.
//
// Scope, honestly stated: this validates the URL's resolved address before
// each navigation or fetch call. Like the design it is modeled on, it does not
// intercept mid-navigation redirects inside Chromium or defend against DNS
// rebinding between this check and the actual connection (a TOCTOU gap shared
// by any resolve-then-connect guard that does not proxy every socket). See
// SECURITY.md for the full threat model.

import { lookup as dnsLookup } from "node:dns/promises";

/** Thrown when a URL is well-formed but resolves to a non-public address. */
export class UnsafeUrlError extends Error {
  constructor(
    message: string,
    readonly url: string,
  ) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/** Resolves a hostname to its IP addresses. Injectable so tests never hit real DNS. */
export type LookupFn = (hostname: string) => Promise<string[]>;

const defaultLookup: LookupFn = async (hostname) => {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
};

/** True if `ip` (v4 or v6, including IPv4-mapped v6) is a non-public address:
 * loopback, private, link-local (the 169.254.0.0/16 block also covers the
 * 169.254.169.254 cloud-metadata endpoint), carrier-grade NAT, multicast, or
 * otherwise reserved. Pure and synchronous, so it is unit-testable without DNS. */
export function isBlockedAddress(ip: string): boolean {
  const v4 = extractIPv4(ip);
  if (v4) return isBlockedIPv4(v4);

  const v6 = normalizeIPv6Groups(ip);
  if (!v6) return true; // Unparseable input is treated as unsafe, not passed through.
  return isBlockedIPv6(v6);
}

/** Validate that `raw` is a well-formed URL and, when it is http(s), that every
 * address its host resolves to is public. Non-http(s) schemes (e.g. `file:`,
 * used by this repo's own local-fixture tests) are returned unchecked: they
 * never reach the network, so they are outside this guard's threat model.
 * Returns the parsed URL on success; throws UnsafeUrlError otherwise. */
export async function assertPublicHttpUrl(
  raw: string,
  opts: { lookup?: LookupFn } = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError(`not a valid URL: ${raw}`, raw);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return url;

  const lookup = opts.lookup ?? defaultLookup;
  const hostname = url.hostname;

  // A literal IP in the URL (http://127.0.0.1/) skips DNS entirely.
  const literal = extractIPv4(hostname)
    ? hostname
    : normalizeIPv6Literal(hostname);
  const addresses = literal
    ? [hostname]
    : await safeLookup(lookup, hostname, raw);

  if (addresses.length === 0) {
    throw new UnsafeUrlError(`could not resolve host: ${hostname}`, raw);
  }

  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new UnsafeUrlError(
        `${raw} resolves to a non-public address (${address})`,
        raw,
      );
    }
  }

  return url;
}

async function safeLookup(
  lookup: LookupFn,
  hostname: string,
  raw: string,
): Promise<string[]> {
  try {
    return await lookup(hostname);
  } catch (err) {
    throw new UnsafeUrlError(
      `DNS lookup failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`,
      raw,
    );
  }
}

// ---------- IPv4 ----------

function extractIPv4(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => o > 255)) return null;
  return octets as [number, number, number, number];
}

/** Blocked IPv4 ranges: this-network, private (RFC 1918), carrier-grade NAT
 * (RFC 6598), loopback, link-local (incl. 169.254.169.254 cloud metadata),
 * IETF protocol assignments, benchmarking, multicast, and reserved/broadcast. */
function isBlockedIPv4([a, b]: [number, number, number, number]): boolean {
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (benchmark)
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + broadcast
  return false;
}

// ---------- IPv6 ----------

/** Expand `ip` to 8 lowercase hex groups (no `::` shorthand, no embedded
 * IPv4 tail), or null if it is not a syntactically valid IPv6 address. */
function normalizeIPv6Groups(ip: string): string[] | null {
  let addr = ip;
  if (addr.startsWith("[") && addr.endsWith("]")) addr = addr.slice(1, -1);
  if (!addr.includes(":")) return null;

  // An embedded IPv4 tail (e.g. "::ffff:127.0.0.1") becomes two hex groups.
  const lastColon = addr.lastIndexOf(":");
  const tail = addr.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = extractIPv4(tail);
    if (!v4) return null;
    const [a, b, c, d] = v4;
    const hi = ((a << 8) | b).toString(16);
    const lo = ((c << 8) | d).toString(16);
    addr = `${addr.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const doubleColon = addr.indexOf("::");
  let head: string[];
  let tailGroups: string[];
  if (doubleColon !== -1) {
    if (addr.indexOf("::", doubleColon + 1) !== -1) return null; // at most one "::"
    head = addr.slice(0, doubleColon).split(":").filter(Boolean);
    tailGroups = addr
      .slice(doubleColon + 2)
      .split(":")
      .filter(Boolean);
  } else {
    head = addr.split(":");
    tailGroups = [];
  }

  const missing = 8 - (head.length + tailGroups.length);
  if (missing < 0) return null;
  const groups = [...head, ...Array(missing).fill("0"), ...tailGroups];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g)))
    return null;
  return groups.map((g) => g.toLowerCase().padStart(4, "0"));
}

function normalizeIPv6Literal(host: string): string | null {
  return normalizeIPv6Groups(host) ? host : null;
}

/** Blocked IPv6 ranges: unspecified, loopback, unique-local (fc00::/7),
 * link-local (fe80::/10), multicast (ff00::/8), and IPv4-mapped addresses
 * (::ffff:0:0/96) whose embedded IPv4 address is itself blocked. */
function isBlockedIPv6(groups: string[]): boolean {
  const nums = groups.map((g) => parseInt(g, 16));

  if (nums.every((n) => n === 0)) return true; // :: (unspecified)
  if (nums.slice(0, 7).every((n) => n === 0) && nums[7] === 1) return true; // ::1

  const g0 = nums[0];
  if (g0 >= 0xfc00 && g0 <= 0xfdff) return true; // fc00::/7 unique-local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast

  // ::ffff:0:0/96 (IPv4-mapped): groups[0..4] == 0, groups[5] == 0xffff, and
  // the embedded IPv4 address is packed into groups[6..7].
  if (nums.slice(0, 5).every((n) => n === 0) && nums[5] === 0xffff) {
    const a = (nums[6] >> 8) & 0xff;
    const b = nums[6] & 0xff;
    const c = (nums[7] >> 8) & 0xff;
    const d = nums[7] & 0xff;
    return isBlockedIPv4([a, b, c, d]);
  }

  return false;
}
