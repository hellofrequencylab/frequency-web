/**
 * Rung-1 spatial layer (Section 12). Each present person has an ephemeral (x,y)
 * on a shared board; positions broadcast live and chat is proximity-scoped.
 *
 * Positions are NOT persisted. Presence carries identity + last-known position;
 * a throttled POSITION broadcast carries smooth movement between presence syncs.
 */

/** Board bounds. Positions clamp to [0, BOARD_W] x [0, BOARD_H]. */
export const BOARD_W = 720;
export const BOARD_H = 460;

/** Pixels moved per WASD / arrow keypress. */
export const STEP = 16;

/** Throttle window for POSITION broadcasts while moving (ms). */
export const POSITION_THROTTLE_MS = 100;

/** How long a chat bubble floats above its sender (ms). */
export const CHAT_TTL_MS = 4000;

/** Distance (px) beyond which a chat bubble fades to its faintest. */
export const HEARING_RANGE = 360;

/** Throttled live-movement broadcast: { userId, x, y }. */
export const POSITION_EVENT = "spatial:pos";

/** Proximity chat line broadcast: { userId, name, text, x, y, at }. */
export const SPATIAL_CHAT_EVENT = "spatial:chat";

/** A point on the board. */
export interface Pos {
  x: number;
  y: number;
}

/** A person present on the board (identity + position). */
export interface SpatialPerson {
  userId: string;
  name: string;
  avatar: Record<string, unknown> | null;
  x: number;
  y: number;
}

/** Payload of a POSITION_EVENT broadcast. */
export interface PositionMsg {
  userId: string;
  x: number;
  y: number;
}

/** Payload of a SPATIAL_CHAT_EVENT broadcast. */
export interface SpatialChatMsg {
  userId: string;
  name: string;
  text: string;
  x: number;
  y: number;
  at: number;
}

/** Clamp a coordinate pair to the board. */
export function clampToBoard(x: number, y: number): Pos {
  return {
    x: Math.max(0, Math.min(BOARD_W, x)),
    y: Math.max(0, Math.min(BOARD_H, y)),
  };
}
