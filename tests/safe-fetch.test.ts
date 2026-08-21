import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parsePublicHttpsUrl } = await import("@/lib/net/safe-fetch");

/**
 * The SSRF guard on the tenant logo (PR-18 security review).
 *
 * The logo URL is typed in by a tenant admin — on a multi-tenant product, by
 * anyone who signs up — and the fetch happens during PDF rendering, which is
 * reachable from the *public* buyer route. Without this guard that is a
 * request issued from inside the hosting network to an address an outsider
 * chose.
 *
 * Only the URL rules are unit-tested here; the DNS check and the redirect
 * refusal need a network and are asserted by reading, not by mocking `fetch`
 * into agreeing with itself.
 */
describe("parsePublicHttpsUrl", () => {
  it("accepts an ordinary https logo URL", () => {
    expect(parsePublicHttpsUrl("https://cdn.example.com/logo.png")?.hostname).toBe(
      "cdn.example.com",
    );
  });

  it("refuses anything that is not https", () => {
    // http can be swapped in transit for a picture that then appears on a
    // legal document; the rest are the classic SSRF protocol escapes.
    for (const url of [
      "http://cdn.example.com/logo.png",
      "file:///etc/passwd",
      "gopher://127.0.0.1:3306/",
      "ftp://example.com/logo.png",
      "data:image/png;base64,AAAA",
      "//cdn.example.com/logo.png",
    ]) {
      expect(parsePublicHttpsUrl(url), url).toBeNull();
    }
  });

  it("refuses a non-default port, which is how internal services are addressed", () => {
    expect(parsePublicHttpsUrl("https://example.com:8080/logo.png")).toBeNull();
    // An explicit :443 is the default and is normalised away, so it is fine.
    expect(parsePublicHttpsUrl("https://example.com:443/logo.png")?.hostname).toBe(
      "example.com",
    );
  });

  it("refuses credentials embedded in the URL", () => {
    expect(parsePublicHttpsUrl("https://user:pass@example.com/logo.png")).toBeNull();
  });

  it("refuses a literal address inside the network", () => {
    for (const host of [
      "127.0.0.1",
      "127.1.1.1",
      "0.0.0.0",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1",
      "169.254.169.254", // the cloud metadata endpoint
      "255.255.255.255",
      "224.0.0.1",
    ]) {
      expect(parsePublicHttpsUrl(`https://${host}/logo.png`), host).toBeNull();
    }
  });

  it("refuses the IPv6 equivalents, including the IPv4-mapped forms", () => {
    for (const host of ["[::1]", "[::]", "[fe80::1]", "[fc00::1]", "[::ffff:127.0.0.1]"]) {
      expect(parsePublicHttpsUrl(`https://${host}/logo.png`), host).toBeNull();
    }
  });

  it("still allows a public literal address", () => {
    expect(parsePublicHttpsUrl("https://203.0.113.7/logo.png")?.hostname).toBe(
      "203.0.113.7",
    );
    expect(parsePublicHttpsUrl("https://172.32.0.1/logo.png")?.hostname).toBe(
      "172.32.0.1",
    );
    expect(parsePublicHttpsUrl("https://[2001:db8::1]/logo.png")).not.toBeNull();
  });

  it("refuses nothing at all", () => {
    expect(parsePublicHttpsUrl(null)).toBeNull();
    expect(parsePublicHttpsUrl(undefined)).toBeNull();
    expect(parsePublicHttpsUrl("")).toBeNull();
    expect(parsePublicHttpsUrl("not a url")).toBeNull();
  });
});
