import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next compiles JSX with the automatic runtime; `tsconfig.json` says
  // "preserve", which esbuild reads as the classic `React.createElement`
  // form. Without this, a component imported by a test renders as `undefined`
  // rather than failing loudly.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
