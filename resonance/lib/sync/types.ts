/**
 * The synchronization engine contract (spec §6.5).
 *
 * The server (or a designated host) is the single source of truth for playback.
 * Clients compute their own position from this state and never become
 * authoritative. This file is the CONTRACT; the implementation (clock math,
 * heartbeat reconciliation, YouTube IFrame binding) lands in the Sync Engine
 * build section, which the build plan sequences FIRST.
 */

export type MediaProvider = "youtube";

export interface RoomState {
  venueId: string;
  mediaProvider: MediaProvider;
  /** Provider id (e.g. YouTube video id). Null when nothing is playing. */
  currentMediaId: string | null;
  /** Server timestamp (ISO) when the current media started. Null when idle. */
  playbackStartedAt: string | null;
  /** Offset into the media at playbackStartedAt, in seconds. */
  startOffsetSeconds: number;
  isPlaying: boolean;
  /** External user id of the DJ holding the floor, if any. No cross-schema FK. */
  currentDjUserId: string | null;
  updatedAt: string;
}

/**
 * Canonical client position formula:
 *   position = (now - playbackStartedAt) + startOffsetSeconds   (clamped >= 0)
 * A late joiner seeks here instantly; a heartbeat re-applies it to fight drift.
 */
export type ComputePosition = (state: RoomState, nowMs: number) => number;
