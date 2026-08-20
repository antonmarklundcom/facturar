import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Route contract (decision 22):
 *   `/`        public landing page — never guarded
 *   `/login`   the login screen
 *   `/admin/*` the authenticated app
 *
 * This middleware is an *optimistic* gate: it only checks that a session cookie
 * is present, because verifying it here would mean running the crypto on every
 * static asset request. The real check is `requireSession()` in the `/admin`
 * layout and `requireRole()` in every mutation — this only saves an
 * unauthenticated visitor a pointless render.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE);

  if (pathname.startsWith("/admin") && !hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Where to land after signing in. Only ever a path on this origin.
    if (pathname !== "/admin") {
      url.searchParams.set("next", `${pathname}${search}`);
    }
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // `/` stays out of the matcher entirely — the landing page (PR-15) must be
  // reachable with no session and must not pay for middleware.
  matcher: ["/admin/:path*", "/login"],
};
