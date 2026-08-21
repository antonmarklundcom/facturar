import { describe, expect, it } from "vitest";
import { parseClientIp } from "@/lib/client-ip";

/**
 * The IP the login limiter keys its backstop scope on (PR-16). Everything
 * here arrives in a header an attacker may control, so the parser's job is to
 * pick the right entry and reject anything that is not plausibly an address —
 * junk must not become a throttle key of its own.
 */
describe("parseClientIp", () => {
  it("takes the original client, not the proxy that forwarded it", () => {
    expect(parseClientIp("203.0.113.7, 70.41.3.18, 150.172.238.178")).toBe("203.0.113.7");
  });

  it("tolerates the spacing a proxy chain happens to use", () => {
    expect(parseClientIp("  203.0.113.7 ,70.41.3.18 ")).toBe("203.0.113.7");
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

  it("skips an empty leading entry instead of returning nothing", () => {
    expect(parseClientIp(", 203.0.113.7")).toBe("203.0.113.7");
  });

  it("falls through to x-real-ip when the forwarded chain is all junk", () => {
    expect(parseClientIp("unknown", "203.0.113.7")).toBe("203.0.113.7");
  });
});
