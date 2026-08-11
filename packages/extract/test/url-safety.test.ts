// Unit tests for the SSRF guard. DNS is always injected (never real network).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertPublicHttpUrl,
  isBlockedAddress,
  UnsafeUrlError,
  type LookupFn,
} from "../src/url-safety.js";

test("isBlockedAddress: blocks IPv4 loopback, private, and link-local ranges", () => {
  for (const ip of [
    "127.0.0.1",
    "0.0.0.0",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud-metadata endpoint
    "169.254.0.1",
    "100.64.0.1", // carrier-grade NAT
    "198.18.0.1", // benchmarking
    "224.0.0.1", // multicast
    "255.255.255.255",
  ]) {
    assert.equal(isBlockedAddress(ip), true, `${ip} should be blocked`);
  }
});

test("isBlockedAddress: allows public IPv4 addresses", () => {
  for (const ip of [
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "172.15.255.255",
    "172.32.0.1",
  ]) {
    assert.equal(isBlockedAddress(ip), false, `${ip} should be public`);
  }
});

test("isBlockedAddress: blocks IPv6 loopback, unique-local, and link-local", () => {
  for (const ip of [
    "::1",
    "::",
    "fc00::1",
    "fd12:3456:789a::1",
    "fe80::1",
    "ff02::1", // multicast
  ]) {
    assert.equal(isBlockedAddress(ip), true, `${ip} should be blocked`);
  }
});

test("isBlockedAddress: unwraps IPv4-mapped IPv6 and checks the embedded address", () => {
  assert.equal(isBlockedAddress("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedAddress("::ffff:169.254.169.254"), true);
  assert.equal(isBlockedAddress("::ffff:8.8.8.8"), false);
  assert.equal(isBlockedAddress("::ffff:808:808"), false); // hex-group form of 8.8.8.8
});

test("isBlockedAddress: allows a public IPv6 address", () => {
  assert.equal(isBlockedAddress("2606:4700:4700::1111"), false);
});

test("isBlockedAddress: treats unparseable input as unsafe", () => {
  assert.equal(isBlockedAddress("not-an-ip"), true);
});

test("assertPublicHttpUrl: passes non-http(s) schemes through without a DNS lookup", async () => {
  let called = false;
  const lookup: LookupFn = async () => {
    called = true;
    return ["127.0.0.1"];
  };
  const url = await assertPublicHttpUrl("file:///tmp/fixture.html", { lookup });
  assert.equal(url.protocol, "file:");
  assert.equal(called, false, "file: URLs must not trigger a DNS lookup");
});

test("assertPublicHttpUrl: rejects a malformed URL", async () => {
  await assert.rejects(
    () => assertPublicHttpUrl("not a url", {}),
    UnsafeUrlError,
  );
});

test("assertPublicHttpUrl: resolves and returns the URL when every address is public", async () => {
  const lookup: LookupFn = async (hostname) => {
    assert.equal(hostname, "example.com");
    return ["93.184.216.34"];
  };
  const url = await assertPublicHttpUrl("https://example.com/page", { lookup });
  assert.equal(url.href, "https://example.com/page");
});

test("assertPublicHttpUrl: rejects when any resolved address is non-public", async () => {
  const lookup: LookupFn = async () => ["93.184.216.34", "127.0.0.1"];
  await assert.rejects(
    () => assertPublicHttpUrl("https://example.com/", { lookup }),
    UnsafeUrlError,
  );
});

test("assertPublicHttpUrl: rejects an IP-literal loopback target without calling lookup", async () => {
  let called = false;
  const lookup: LookupFn = async () => {
    called = true;
    return ["8.8.8.8"];
  };
  await assert.rejects(
    () => assertPublicHttpUrl("http://127.0.0.1:8080/admin", { lookup }),
    UnsafeUrlError,
  );
  assert.equal(called, false, "an IP-literal host must skip DNS entirely");
});

test("assertPublicHttpUrl: rejects the cloud-metadata address by IP literal", async () => {
  await assert.rejects(() =>
    assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/", {
      lookup: async () => ["8.8.8.8"],
    }),
  );
});

test("assertPublicHttpUrl: wraps a DNS failure in UnsafeUrlError", async () => {
  const lookup: LookupFn = async () => {
    throw new Error("ENOTFOUND");
  };
  await assert.rejects(
    () => assertPublicHttpUrl("https://does-not-resolve.invalid/", { lookup }),
    UnsafeUrlError,
  );
});
