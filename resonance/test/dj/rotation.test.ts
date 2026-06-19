import { describe, it, expect } from "vitest";
import {
  tally,
  shouldBump,
  nextDj,
  firstFreeSeat,
  type Seat,
} from "@/lib/dj/rotation";

describe("vote tally", () => {
  it("counts and nets", () => {
    expect(tally([{ value: "awesome" }, { value: "awesome" }, { value: "lame" }])).toEqual({
      awesome: 2,
      lame: 1,
      net: 1,
    });
  });
  it("is zero for no votes", () => {
    expect(tally([])).toEqual({ awesome: 0, lame: 0, net: 0 });
  });
  it("bumps only on a negative net", () => {
    expect(shouldBump({ awesome: 1, lame: 1, net: 0 })).toBe(false);
    expect(shouldBump({ awesome: 0, lame: 1, net: -1 })).toBe(true);
  });
});

describe("nextDj round-robin", () => {
  const seats: Seat[] = [
    { seatIndex: 2, occupantUserId: "c" },
    { seatIndex: 0, occupantUserId: "a" },
    { seatIndex: 1, occupantUserId: "b" },
  ];

  it("starts at the lowest seat when nobody has played", () => {
    expect(nextDj(seats, null)).toBe("a");
  });
  it("advances in seat order and wraps", () => {
    expect(nextDj(seats, "a")).toBe("b");
    expect(nextDj(seats, "b")).toBe("c");
    expect(nextDj(seats, "c")).toBe("a");
  });
  it("falls back to the first DJ when the current one is gone", () => {
    expect(nextDj(seats, "zzz")).toBe("a");
  });
  it("returns null when no one is seated", () => {
    expect(nextDj([], "a")).toBeNull();
  });
});

describe("firstFreeSeat", () => {
  it("finds the lowest open index", () => {
    expect(firstFreeSeat([0, 2], 5)).toBe(1);
    expect(firstFreeSeat([], 5)).toBe(0);
  });
  it("returns null when full", () => {
    expect(firstFreeSeat([0, 1, 2], 3)).toBeNull();
  });
});
