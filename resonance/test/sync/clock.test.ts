import { describe, it, expect } from "vitest";
import {
  computePosition,
  startTrack,
  pause,
  resume,
  seek,
  endTrack,
  IDLE,
} from "@/lib/sync/clock";

const t0 = Date.parse("2026-06-19T00:00:00.000Z");

describe("sync clock", () => {
  it("plays forward from the top", () => {
    const s = startTrack("vid1", t0);
    expect(computePosition(s, t0)).toBe(0);
    expect(computePosition(s, t0 + 10_000)).toBe(10);
    expect(s.isPlaying).toBe(true);
    expect(s.currentMediaId).toBe("vid1");
  });

  it("freezes position on pause", () => {
    const playing = startTrack("vid1", t0);
    const paused = pause(playing, t0 + 10_000);
    expect(paused.isPlaying).toBe(false);
    expect(paused.startOffsetSeconds).toBe(10);
    // position no longer advances while paused
    expect(computePosition(paused, t0 + 60_000)).toBe(10);
  });

  it("resumes from the frozen offset", () => {
    const paused = pause(startTrack("vid1", t0), t0 + 10_000);
    const resumed = resume(paused, t0 + 60_000);
    expect(resumed.isPlaying).toBe(true);
    expect(computePosition(resumed, t0 + 60_000)).toBe(10);
    expect(computePosition(resumed, t0 + 65_000)).toBe(15);
  });

  it("treats resume while playing as a no-op", () => {
    const playing = startTrack("vid1", t0);
    expect(resume(playing, t0 + 5_000)).toBe(playing);
  });

  it("seeks while playing and keeps playing", () => {
    const playing = startTrack("vid1", t0);
    const seeked = seek(playing, 100, t0 + 5_000);
    expect(seeked.isPlaying).toBe(true);
    expect(computePosition(seeked, t0 + 5_000)).toBe(100);
    expect(computePosition(seeked, t0 + 8_000)).toBe(103);
  });

  it("seeks while paused and stays paused", () => {
    const paused = pause(startTrack("vid1", t0), t0 + 10_000);
    const seeked = seek(paused, 42, t0 + 70_000);
    expect(seeked.isPlaying).toBe(false);
    expect(computePosition(seeked, t0 + 999_999)).toBe(42);
  });

  it("clamps a negative seek to zero", () => {
    expect(seek(startTrack("vid1", t0), -10, t0).startOffsetSeconds).toBe(0);
  });

  it("goes idle on end", () => {
    const seeked = seek(startTrack("vid1", t0), 100, t0);
    const ended = endTrack(seeked);
    expect(ended.currentMediaId).toBeNull();
    expect(ended.isPlaying).toBe(false);
    expect(computePosition(ended, t0 + 999_999)).toBe(0);
  });

  it("never returns a negative position when idle", () => {
    expect(computePosition(IDLE, t0)).toBe(0);
  });
});
