/**
 * `server-only` throws on import outside a React Server Component, which is
 * exactly what it is for — but it also makes a server module untestable
 * (recorded as a Phase A finding). Vitest aliases the package to this empty
 * stub so a unit test can import, say, the PDF snapshot store directly.
 *
 * This changes nothing about the app: `next build` still resolves the real
 * package and still refuses to pull a server module into a client bundle.
 */
export {};
