/**
 * Marks a redirect to the login screen as "the session you were carrying is
 * finished" — expired, or belonging to a user who has since been deactivated
 * or deleted.
 *
 * It exists to break a redirect loop. The middleware sends anyone holding a
 * session cookie from `/login` to `/admin`, and `requireSession()` sends an
 * unusable session from `/admin` to `/login`; a cookie that is *present but no
 * longer valid* therefore bounces between the two forever. The middleware
 * treats this parameter as permission to delete the cookie and let the login
 * form render, which both ends the loop and clears the dead credential.
 *
 * **This module imports nothing, and must keep importing nothing.** The
 * middleware runs on the Edge runtime, so anything it reaches has to bundle
 * without Node built-ins. Declaring these two strings in `guards.ts` — which
 * now reaches the database through `users.ts` — pulled `mysql2` into the Edge
 * bundle and broke the production build outright. Same family of trap as the
 * PR-14 finding about a server component calling into a `"use client"` module:
 * these boundaries are only visible when something is built or run.
 */
export const SESSION_ENDED_PARAM = "sesion";
export const SESSION_ENDED_VALUE = "expirada";
