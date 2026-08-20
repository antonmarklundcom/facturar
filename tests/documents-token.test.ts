import { describe, expect, it } from "vitest";
import {
  PUBLIC_TOKEN_LENGTH,
  generatePublicToken,
  isPublicTokenShape,
  publicDocumentUrl,
} from "@/lib/documents/token";

describe("generatePublicToken", () => {
  it("produces a URL-safe token of the documented length", () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const token = generatePublicToken();
      expect(token).toHaveLength(PUBLIC_TOKEN_LENGTH);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      // base64url must never contain padding or a slash — both break a URL.
      expect(token).not.toContain("=");
      expect(token).not.toContain("/");
      expect(token).not.toContain("+");
    }
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generatePublicToken()));
    expect(tokens.size).toBe(500);
  });
});

describe("isPublicTokenShape", () => {
  it("accepts what the generator produces", () => {
    expect(isPublicTokenShape(generatePublicToken())).toBe(true);
  });

  it("rejects anything that is not a token, before it reaches a query", () => {
    for (const value of [
      "",
      "short",
      "../../etc/passwd",
      "a".repeat(PUBLIC_TOKEN_LENGTH + 1),
      "a".repeat(PUBLIC_TOKEN_LENGTH - 1),
      `${"a".repeat(PUBLIC_TOKEN_LENGTH - 1)}%`,
      `${"a".repeat(PUBLIC_TOKEN_LENGTH - 1)}'`,
    ]) {
      expect(isPublicTokenShape(value), value).toBe(false);
    }
  });
});

describe("publicDocumentUrl", () => {
  it("builds the buyer link", () => {
    expect(publicDocumentUrl("abc", "https://facturar.clientes.com.py")).toBe(
      "https://facturar.clientes.com.py/d/abc",
    );
  });

  it("tolerates a trailing slash in the configured base URL", () => {
    expect(publicDocumentUrl("abc", "https://example.com/")).toBe("https://example.com/d/abc");
    expect(publicDocumentUrl("abc", "https://example.com///")).toBe(
      "https://example.com/d/abc",
    );
  });
});
