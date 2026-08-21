/**
 * The client's IP address as seen through a reverse proxy.
 *
 * Hostinger's managed Node slots sit behind a proxy, so the socket address is
 * always the proxy's; the real client is in `x-forwarded-for`, whose first
 * entry is the original client and whose later entries are the proxies it
 * passed through.
 *
 * **This value is only as trustworthy as the proxy in front of the app.**
 * Anything reachable directly can set the header to whatever it likes, so the
 * IP scope of the login limiter is a backstop and never the primary defence —
 * the per-email limit is, and that one is keyed on a value the attacker must
 * actually use to get anywhere. This is why the IP scope's only job is to slow
 * a spray across many addresses.
 *
 * Pure and header-shaped rather than request-shaped so it can be tested
 * without a server.
 */
export function parseClientIp(
  forwardedFor: string | null,
  realIp: string | null = null,
): string | null {
  const first = (forwardedFor ?? "")
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.length > 0);

  return normalizeIp(first) ?? normalizeIp(realIp?.trim()) ?? null;
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
