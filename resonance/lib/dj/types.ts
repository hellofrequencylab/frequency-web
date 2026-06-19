export interface Venue {
  id: string;
  worldId: string;
  name: string;
  mediaType: "dj" | "watch" | "lounge" | "event";
  seatCount: number;
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
