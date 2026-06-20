export type MediaType = "dj" | "watch" | "lounge" | "event";

/** One placed decoration on a venue board (build plan §13). */
export interface DecorItem {
  id: string;
  kind: string;
  x: number;
  y: number;
  scale?: number;
}

export interface Venue {
  id: string;
  worldId: string;
  name: string;
  theme: string | null;
  mediaType: MediaType;
  seatCount: number;
  /** Ordered media ids for the ambient auto-DJ (lounge venues only). */
  playlist: string[];
  /** Placed decorations, rendered as the room backdrop. */
  decor: DecorItem[];
  /** Venue level. Higher levels unlock more of the decor palette. */
  level: number;
  /** Host/owner who may edit decor. Null for legacy venues (pre-ownership). */
  createdBy: string | null;
}

/** Venue plus lightweight activity signals for the lobby. */
export interface VenueSummary extends Venue {
  djs: number;
  isPlaying: boolean;
  /** People present right now (presence pings seen in the last ~45s). */
  here: number;
}

export interface SeatRow {
  seatIndex: number;
  occupantUserId: string;
  joinedAt: string;
}

export interface QueueItem {
  id: string;
  venueId: string;
  userId: string;
  mediaId: string;
  mediaProvider: "youtube";
  title: string | null;
  thumbnail: string | null;
  position: number;
  status: "queued" | "played" | "skipped";
}
