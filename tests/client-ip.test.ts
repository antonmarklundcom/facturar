import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRUSTED_PROXY_HOPS,
  parseClientIp,
  trustedProxyHops,
} from "@/lib/client-ip";

/**
 * The IP the login limiter keys its backstop scope on (PR-16). Everything
 * here arrives in a header an attacker may control, so the parser's job is to
 * pick the right entry and reject anything that is not plausibly an address —
 * junk must not become a throttle key of its own.
 */
describe("parseClientIp", () => {
  it("counts from the right, because proxies append and clients cannot", () => {
    // One trusted proxy: the entry it appended is the last one, and it is the
    // only entry in the list that the client could not have written.
    expect(parseClientIp("203.0.113.7, 70.41.3.18, 150.172.238.178")).toBe(
      "150.172.238.178",
    );
  });

  it("ignores a forged leading entry entirely", () => {
    // The attack this closes twice over: `1.2.3.4` is what a spray sends to
    // mint a fresh counter per request, and what it sends to lock a tenant's
    // office out of its own login. With one trusted proxy neither works.
    expect(parseClientIp("1.2.3.4, 203.0.113.7")).toBe("203.0.113.7");
    expect(parseClientIp("evil, 203.0.113.7")).toBe("203.0.113.7");
  });

  it("honours a longer trusted chain", () => {
    const chain = "1.2.3.4, 203.0.113.7, 10.0.0.5";
    // Two proxies append, so the client is two from the right.
    expect(parseClientIp(chain, null, 2)).toBe("203.0.113.7");
  });

  it("trusts nothing when no proxy is in front", () => {
    // Better no IP scope at all than an IP scope keyed on attacker input.
    expect(parseClientIp("203.0.113.7", "203.0.113.7", 0)).toBeNull();
  });

  it("tolerates the spacing a proxy chain happens to use", () => {
    expect(parseClientIp("  70.41.3.18 ,203.0.113.7 ")).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when there is no forwarded-for", () => {
    expect(parseClientIp(null, "203.0.113.7")).toBe("203.0.113.7");
    expect(parseClientIp("", "203.0.113.7")).toBe("203.0.113.7");
  });

  it("reads IPv6, bracketed or bare, and normalises its case", () => {
    expect(parseClientIp("2001:DB8::1")).toBe("2001:db8::1");
    expect(parseClientIp("[2001:db8::1]:443")).toBe("2001:db8::1");
  });

  it("drops a trailing port from an IPv4 address", () => {
    expect(parseClientIp("203.0.113.7:51234")).toBe("203.0.113.7");
  });

  it("returns null when there is nothing usable", () => {
    expect(parseClientIp(null, null)).toBeNull();
    expect(parseClientIp("", "")).toBeNull();
    expect(parseClientIp("   ")).toBeNull();
  });

  it("rejects text that is not an address, rather than keying on it", () => {
    // Otherwise an attacker gets a fresh IP budget per made-up header value —
    // and a place to write arbitrary strings into the database.
    expect(parseClientIp("unknown")).toBeNull();
    expect(parseClientIp("<script>alert(1)</script>")).toBeNull();
    expect(parseClientIp("999.1.1.1")).toBeNull();
    expect(parseClientIp("203.0.113")).toBeNull();
    expect(parseClientIp("203.0.113.7.8")).toBeNull();
  });

  it("skips empty entries instead of returning nothing", () => {
    expect(parseClientIp("203.0.113.7, ")).toBe("203.0.113.7");
    expect(parseClientIp(", 203.0.113.7")).toBe("203.0.113.7");
  });

  it("falls through to x-real-ip when the forwarded chain is all junk", () => {
    expect(parseClientIp("unknown", "203.0.113.7")).toBe("203.0.113.7");
  });
});

describe("trustedProxyHops", () => {
  it("defaults to one managed front end", () => {
    expect(trustedProxyHops(undefined)).toBe(DEFAULT_TRUSTED_PROXY_HOPS);
    expect(trustedProxyHops("")).toBe(DEFAULT_TRUSTED_PROXY_HOPS);
  });

  it("reads an explicit count, including zero for no proxy at all", () => {
    expect(trustedProxyHops("2")).toBe(2);
    expect(trustedProxyHops("0")).toBe(0);
  });

  it("falls back to the default rather than to trusting the client", () => {
    // A typo in an env var must never become "believe the leftmost entry".
    for (const bad of ["-1", "abc", "1.5", " "]) {
      expect(trustedProxyHops(bad)).toBe(DEFAULT_TRUSTED_PROXY_HOPS);
    }
  });
});
