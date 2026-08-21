import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Guard for the one place this app fetches a URL a *user* supplied: the tenant
 * logo that gets embedded in every PDF (PR-18 security review).
 *
 * Without this the fetch is an SSRF primitive. Any tenant admin — which on a
 * multi-tenant product means anyone who signs up — could point the logo at
 * `http://169.254.169.254/latest/meta-data/…` or at a service listening on
 * localhost, and the request would leave from inside the hosting network. It
 * is worse than the usual authenticated SSRF because rendering is also
 * reachable from the *public* buyer route `/d/[token]/pdf`, so the fetch can
 * be triggered by someone with no account at all, holding only a shared link.
 *
 * Three rules, each closing a different way around the others:
 *
 *  1. **https only, on its default port.** A logo fetched over plaintext could
 *     be swapped in transit for a picture that then appears on a legal
 *     document, and a non-default port is how an internal service is usually
 *     reached.
 *  2. **The resolved address must be public.** Checking the hostname is not
 *     enough: `logo.attacker.com` can have an A record of `127.0.0.1`. The
 *     name is resolved here and every address it returns is checked.
 *  3. **No redirects.** A permitted host answering `302 http://169.254.169.254/`
 *     would otherwise walk straight through rules 1 and 2, which ran against
 *     the first URL only.
 */

/** Ranges that must never be reachable from a user-supplied URL. */
function isPrivateAddress(address: string, family: number): boolean {
  if (family === 6) return isPrivateIpv6(address);
  return isPrivateIpv4(address);
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  // Unparseable reads as private: this function decides what to *allow*, so
  // anything it does not understand must fall on the refusing side.
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;

  const [a, b] = parts;

  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local — the cloud metadata range
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a >= 224) return true; // multicast, reserved, broadcast

  return false;
}

function isPrivateIpv6(address: string): boolean {
  const value = address.toLowerCase().split("%")[0];

  if (value === "::" || value === "::1") return true; // unspecified, loopback
  if (value.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(value)) return true; // unique local
  if (value.startsWith("ff")) return true; // multicast

  // An IPv4-mapped address reaches the IPv4 stack, so it has to be judged
  // there. It arrives in either of two spellings, and `new URL` rewrites the
  // readable one into the other: `::ffff:127.0.0.1` normalises to
  // `::ffff:7f00:1`. Matching only the dotted form let loopback straight
  // through — the unit test caught it.
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (dotted) return isPrivateIpv4(dotted[1]);

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value);
  if (hex) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    return isPrivateIpv4(
      [high >> 8, high & 0xff, low >> 8, low & 0xff].join("."),
    );
  }

  return false;
}

/**
 * Is this URL safe to fetch from the server on a user's say-so? Returns the
 * parsed URL when it is and `null` otherwise — callers treat `null` as "no
 * logo", never as an error worth surfacing.
 *
 * Split out from the fetch so the rules are unit-testable without a network.
 */
export function parsePublicHttpsUrl(candidate: string | null | undefined): URL | null {
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  // `new URL` normalises an explicit :443 away, so anything left here is a
  // non-default port — which is how an internal service is usually addressed.
  if (url.port !== "") return null;
  if (url.username !== "" || url.password !== "") return null;

  // A literal address skips DNS entirely, so it is judged here and now.
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  const family = isIP(literal);
  if (family !== 0 && isPrivateAddress(literal, family)) return null;

  return url;
}

/** Every address this hostname resolves to must be public. */
export async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  const literal = hostname.replace(/^\[|\]$/g, "");
  const family = isIP(literal);
  if (family !== 0) return !isPrivateAddress(literal, family);

  try {
    const addresses = await lookup(literal, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every((entry) => !isPrivateAddress(entry.address, entry.family));
  } catch {
    return false;
  }
}

/**
 * Fetch a user-supplied URL with all three rules applied.
 *
 * A gap remains between the DNS check and the connection: the name could be
 * re-resolved to a private address in between (DNS rebinding). Closing it
 * needs an agent that pins the socket to the address that was checked, which
 * Node's `fetch` does not expose. The window is narrow and the payoff is
 * bounded by the caller's content-type allowlist; the durable fix is to stop
 * fetching arbitrary URLs at all and store uploaded logos on disk, which is
 * recorded in the v1.1 backlog.
 */
export async function fetchPublicUrl(
  candidate: string | null | undefined,
  init: RequestInit = {},
): Promise<Response | null> {
  const url = parsePublicHttpsUrl(candidate);
  if (!url) return null;
  if (!(await resolvesToPublicAddress(url.hostname))) return null;

  const response = await fetch(url, { ...init, redirect: "manual" });

  // "manual" surfaces a redirect rather than following it. A logo host that
  // redirects is simply not used: re-validating every hop is more machinery
  // than a decorative image is worth.
  if (response.status >= 300 && response.status < 400) return null;

  return response;
}
