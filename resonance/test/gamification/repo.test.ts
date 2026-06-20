import { describe, it, expect } from "vitest";
import { seededRefId } from "@/lib/gamification/repo";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("seededRefId", () => {
  it("is deterministic: same seed -> same uuid", () => {
    expect(seededRefId("trivia:venue1:3")).toBe(seededRefId("trivia:venue1:3"));
    expect(seededRefId("revshare:item:buyer")).toBe(seededRefId("revshare:item:buyer"));
  });

  it("maps different seeds to different uuids", () => {
    expect(seededRefId("trivia:venue1:3")).not.toBe(seededRefId("trivia:venue1:4"));
    expect(seededRefId("a")).not.toBe(seededRefId("b"));
    expect(seededRefId("")).not.toBe(seededRefId("x"));
  });

  it("formats output as a uuid", () => {
    for (const seed of ["", "trivia:v:1", "revshare:item-9:user-42", "🔥unicode🔥"]) {
      expect(seededRefId(seed)).toMatch(UUID_RE);
    }
  });

  it("sets the version nibble to 8 (RFC 9562 v8/custom)", () => {
    const id = seededRefId("trivia:venue1:3");
    expect(id[14]).toBe("8");
  });

  it("sets the variant nibble to 8-b (RFC 4122 variant)", () => {
    const id = seededRefId("revshare:item:buyer");
    expect(["8", "9", "a", "b"]).toContain(id[19]);
  });
});
