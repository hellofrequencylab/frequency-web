import { describe, it, expect } from "vitest";
import { CREATOR_SHARE } from "@/lib/creator/types";
import { revshareRefId } from "@/lib/creator/repo";
import { seededRefId } from "@/lib/gamification/repo";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("CREATOR_SHARE", () => {
  it("is the documented 70% cut", () => {
    expect(CREATOR_SHARE).toBe(0.7);
  });

  it("floors a creator's cut correctly at boundary values", () => {
    const cut = (spend: number) => Math.floor(spend * CREATOR_SHARE);
    expect(cut(0)).toBe(0);
    expect(cut(1)).toBe(0); // 0.7 floors to 0
    expect(cut(10)).toBe(7);
    expect(cut(100)).toBe(70);
    expect(cut(99)).toBe(69); // 69.3 floors to 69
  });
});

describe("revshareRefId", () => {
  it("derives the same ref the seeded scheme would", () => {
    expect(revshareRefId("item9", "buyer1")).toBe(
      seededRefId("revshare:item9:buyer1"),
    );
  });

  it("is deterministic and uuid-shaped", () => {
    const id = revshareRefId("item9", "buyer1");
    expect(id).toBe(revshareRefId("item9", "buyer1"));
    expect(id).toMatch(UUID_RE);
  });

  it("distinguishes item and buyer", () => {
    expect(revshareRefId("item9", "buyer1")).not.toBe(
      revshareRefId("item9", "buyer2"),
    );
    expect(revshareRefId("itemA", "buyer1")).not.toBe(
      revshareRefId("itemB", "buyer1"),
    );
  });
});
