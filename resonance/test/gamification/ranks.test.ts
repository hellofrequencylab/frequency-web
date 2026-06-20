import { describe, it, expect } from "vitest";
import { rankForPoints, nextRank } from "@/lib/gamification/ranks";

describe("rankForPoints", () => {
  it("starts at Crew", () => {
    expect(rankForPoints(0)).toBe("Crew");
    expect(rankForPoints(9)).toBe("Crew");
  });
  it("steps up at each threshold", () => {
    expect(rankForPoints(10)).toBe("Deshi");
    expect(rankForPoints(25)).toBe("Sempai");
    expect(rankForPoints(50)).toBe("Sensei");
    expect(rankForPoints(100)).toBe("Sifu");
    expect(rankForPoints(200)).toBe("Bodhisattva");
    expect(rankForPoints(9999)).toBe("Bodhisattva");
  });
});

describe("nextRank", () => {
  it("reports the next threshold and remaining points", () => {
    expect(nextRank(0)).toEqual({ name: "Deshi", remaining: 10 });
    expect(nextRank(20)).toEqual({ name: "Sempai", remaining: 5 });
  });
  it("is null at the top rank", () => {
    expect(nextRank(200)).toBeNull();
  });
});
