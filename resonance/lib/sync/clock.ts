import type { RoomState } from "./types";

/**
 * The server-authoritative clock (spec §6.5), as pure functions.
 *
 * The server is the single source of truth: it persists a RoomState, and clients
 * compute their own position from it. These functions hold ALL the playback math
 * so it is trivially testable and identical on every surface. No IO here.
 */

/** The mutable playback fields the transitions produce; the rest of RoomState
 * (venueId, mediaProvider, updatedAt) is owned by the store. */
export type PlaybackFields = Pick<
  RoomState,
  | "currentMediaId"
  | "playbackStartedAt"
  | "startOffsetSeconds"
  | "isPlaying"
  | "currentDjUserId"
>;

/** Nothing playing. */
export const IDLE: PlaybackFields = {
  currentMediaId: null,
  playbackStartedAt: null,
  startOffsetSeconds: 0,
  isPlaying: false,
  currentDjUserId: null,
};

type Clock = Pick<
  RoomState,
  "isPlaying" | "playbackStartedAt" | "startOffsetSeconds"
>;

/**
 * Canonical position formula:
 *   position = startOffset + (playing ? (now - startedAt) : 0)   // clamped >= 0
 * A late joiner seeks here; a heartbeat re-applies it to fight drift.
 */
export function computePosition(state: Clock, nowMs: number): number {
  if (!state.isPlaying || !state.playbackStartedAt) {
    return Math.max(0, state.startOffsetSeconds);
  }
  const elapsedSeconds = (nowMs - Date.parse(state.playbackStartedAt)) / 1000;
  return Math.max(0, state.startOffsetSeconds + elapsedSeconds);
}

/** Load a new track and start it from the top. */
export function startTrack(
  mediaId: string,
  nowMs: number,
  djUserId: string | null = null,
): PlaybackFields {
  return {
    currentMediaId: mediaId,
    playbackStartedAt: new Date(nowMs).toISOString(),
    startOffsetSeconds: 0,
    isPlaying: true,
    currentDjUserId: djUserId,
  };
}

/** Pause: freeze the current position into the offset. */
export function pause(state: PlaybackFields, nowMs: number): PlaybackFields {
  return {
    ...state,
    startOffsetSeconds: computePosition(state, nowMs),
    playbackStartedAt: null,
    isPlaying: false,
  };
}

/** Resume from the frozen offset. No-op if already playing. */
export function resume(state: PlaybackFields, nowMs: number): PlaybackFields {
  if (state.isPlaying) return state;
  return {
    ...state,
    playbackStartedAt: new Date(nowMs).toISOString(),
    isPlaying: true,
  };
}

/** Seek to an absolute position (seconds). Keeps play/pause state. */
export function seek(
  state: PlaybackFields,
  positionSeconds: number,
  nowMs: number,
): PlaybackFields {
  const offset = Math.max(0, positionSeconds);
  return {
    ...state,
    startOffsetSeconds: offset,
    playbackStartedAt: state.isPlaying ? new Date(nowMs).toISOString() : null,
  };
}

/** End the current track; the room goes idle. */
export function endTrack(state: PlaybackFields): PlaybackFields {
  return { ...IDLE, currentDjUserId: state.currentDjUserId };
}
