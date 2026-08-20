import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { defaultLocale, isLocale, locales } from "@/i18n/config";

type Catalog = { [key: string]: string | Catalog };

function flatten(catalog: Catalog, prefix = ""): string[] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flatten(value, path);
  });
}

describe("translation catalogs", () => {
  const esKeys = flatten(es as Catalog).sort();
  const enKeys = flatten(en as Catalog).sort();

  it("ship the same keys in es and en (guardrail 5)", () => {
    expect(enKeys).toEqual(esKeys);
  });

  it("has no empty message values", () => {
    for (const [name, catalog] of [
      ["es", es],
      ["en", en],
    ] as const) {
      const empty = flatten(catalog as Catalog).filter((key) => {
        const value = key
          .split(".")
          .reduce<unknown>((node, part) => (node as Catalog)[part], catalog);
        return typeof value === "string" && value.trim() === "";
      });
      expect(empty, `empty keys in ${name}`).toEqual([]);
    }
  });
});

describe("locale config", () => {
  it("exposes exactly es and en", () => {
    expect([...locales]).toEqual(["es", "en"]);
  });

  it("defaults to Spanish", () => {
    expect(defaultLocale).toBe("es");
  });

  it("rejects unknown locale values", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("pt")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
