/**
 * The client's IP address as seen through a reverse proxy.
 *
 * `x-forwarded-for` is a list that each proxy **appends** to. The leftmost
 * entry is therefore whatever the *client* sent — pure attacker input — and
 * only the entries appended by proxies you actually control can be believed.
 * Counting from the right is the only correct way to read it: with one trusted
 * proxy in front, the last entry is the address that proxy observed, which is
 * the real client.
 *
 * Reading the leftmost entry instead breaks the login limiter in both
 * directions at once (PR-18 security review):
 *
 *  - **Bypass.** A spray sends `X-Forwarded-For: 203.0.113.<random>` on every
 *    request, minting a fresh counter each time, and the IP scope never fires.
 *  - **Denial of service against a customer.** Worse: an attacker sends the
 *    header set to a tenant's *office* address and fails to log in twenty
 *    times, locking that office out of its own invoicing for the window.
 *
 * `TRUSTED_PROXY_HOPS` says how many proxies append to the header before the
 * app sees it. One is right for a single managed front end, which is what
 * Hostinger's Node slots are — **verify it at deploy time (PR-6)** by logging
 * the raw header once from the live URL. Setting it to `0` means "there is no
 * proxy, do not believe this header at all", and the IP scope is then simply
 * not applied rather than applied to a value an attacker chose.
 *
 * Pure and header-shaped rather than request-shaped so it can be tested
 * without a server.
 */
export const DEFAULT_TRUSTED_PROXY_HOPS = 1;

export function trustedProxyHops(raw = process.env.TRUSTED_PROXY_HOPS): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_TRUSTED_PROXY_HOPS;

  const parsed = Number(raw);
  // A misconfigured value must not silently become "trust the client".
  if (!Number.isInteger(parsed) || parsed < 0) return DEFAULT_TRUSTED_PROXY_HOPS;

  return parsed;
}

export function parseClientIp(
  forwardedFor: string | null,
  realIp: string | null = null,
  hops: number = trustedProxyHops(),
): string | null {
  // No trusted proxy means no trustworthy header. Returning null drops the IP
  // scope entirely, which is strictly better than keying it on attacker input.
  if (hops < 1) return null;

  const entries = (forwardedFor ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  // The address the outermost trusted proxy observed: `hops` from the right.
  const candidate = entries[entries.length - hops];

  // `x-real-ip` is set by the proxy itself rather than forwarded from the
  // client, so it needs no hop counting — but it is only a fallback, since a
  // directly reachable app would see the client's own copy of it.
  return normalizeIp(candidate) ?? normalizeIp(realIp?.trim()) ?? null;
}

/**
 * Strip the noise a proxy chain adds — brackets around an IPv6 literal, a
 * trailing port — and reject anything that is not plausibly an address, so a
 * header full of junk cannot become a throttle key of its own.
 */
function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;

  let candidate = value.trim();

  // "[2001:db8::1]:443" → "2001:db8::1"
  const bracketed = /^\[(.+)\](?::\d+)?$/.exec(candidate);
  if (bracketed) candidate = bracketed[1];
  // "203.0.113.7:51234" → "203.0.113.7" (IPv4 only: a bare IPv6 has colons
  // of its own and no port unless bracketed).
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }

  if (!isIpv4(candidate) && !isIpv6(candidate)) return null;
  return candidate.toLowerCase();
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;

  return parts.every(
    (part) =>
      /^\d{1,3}$/.test(part) && Number(part) <= 255 && (part === "0" || part[0] !== "0"),
  );
}

function isIpv6(value: string): boolean {
  // Deliberately loose: this is a cache key, not a firewall rule. It only has
  // to reject text that is obviously not an address.
  return /^[0-9a-f:]+$/i.test(value) && value.includes(":") && value.length <= 45;
}
