export type MediaType = "dj" | "watch" | "lounge" | "event";

export interface Venue {
  id: string;
  worldId: string;
  name: string;
  theme: string | null;
  mediaType: MediaType;
  seatCount: number;
  /** Ordered media ids for the ambient auto-DJ (lounge venues only). */
  playlist: string[];
}

/** Venue plus lightweight activity signals for the lobby. */
export interface VenueSummary extends Venue {
  djs: number;
  isPlaying: boolean;
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
