import { describe, it, expect, afterEach, vi } from "vitest";
import { allowedOrigins, isAllowedOrigin } from "@/lib/embed/origins";

const ENV = "NEXT_PUBLIC_RESONANCE_ALLOWED_ORIGINS";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("allowedOrigins", () => {
  it("is empty when the env is unset", () => {
    vi.stubEnv(ENV, "");
    expect(allowedOrigins()).toEqual([]);
  });
  it("parses a comma list, trimming and dropping blanks", () => {
    vi.stubEnv(ENV, " https://a.com , ,https://b.com ");
    expect(allowedOrigins()).toEqual(["https://a.com", "https://b.com"]);
  });
});

describe("isAllowedOrigin", () => {
  it("allows a listed origin", () => {
    vi.stubEnv(ENV, "https://parent.example");
    expect(isAllowedOrigin("https://parent.example")).toBe(true);
  });

  it("denies an unlisted origin", () => {
    vi.stubEnv(ENV, "https://parent.example");
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
  });

  it("denies everything cross-origin when the env is empty", () => {
    vi.stubEnv(ENV, "");
    expect(isAllowedOrigin("https://anything.example")).toBe(false);
  });

  it("always allows same-origin regardless of the list", () => {
    vi.stubEnv(ENV, "");
    vi.stubGlobal("window", { location: { origin: "https://self.example" } });
    expect(isAllowedOrigin("https://self.example")).toBe(true);
    // a different origin is still denied with an empty list
    expect(isAllowedOrigin("https://other.example")).toBe(false);
  });
});
