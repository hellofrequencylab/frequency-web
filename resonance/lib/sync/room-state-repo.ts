import { createServerClient } from "@/lib/supabase/server";
import type { RoomState } from "./types";
import type { PlaybackFields } from "./clock";

/**
 * Server-side store for the authoritative RoomState. Service-role only; never
 * import into a Client Component. This is the single writer of truth — clients
 * read derived state via the route handler, never the table directly.
 */

type Row = {
  venue_id: string;
  media_provider: "youtube";
  current_media_id: string | null;
  playback_started_at: string | null;
  start_offset_seconds: number | string;
  is_playing: boolean;
  current_dj_user_id: string | null;
  updated_at: string;
};

function toRoomState(r: Row): RoomState {
  return {
    venueId: r.venue_id,
    mediaProvider: r.media_provider,
    currentMediaId: r.current_media_id,
    playbackStartedAt: r.playback_started_at,
    // numeric comes back as string from postgres; normalize to number.
    startOffsetSeconds: Number(r.start_offset_seconds),
    isPlaying: r.is_playing,
    currentDjUserId: r.current_dj_user_id,
    updatedAt: r.updated_at,
  };
}

export async function getRoomState(venueId: string): Promise<RoomState | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("room_state")
    .select("*")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) throw error;
  return data ? toRoomState(data as Row) : null;
}

/** Persist new playback fields for a venue and return the saved RoomState. */
export async function applyPlayback(
  venueId: string,
  fields: PlaybackFields,
): Promise<RoomState> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("room_state")
    .upsert(
      {
        venue_id: venueId,
        media_provider: "youtube",
        current_media_id: fields.currentMediaId,
        playback_started_at: fields.playbackStartedAt,
        start_offset_seconds: fields.startOffsetSeconds,
        is_playing: fields.isPlaying,
        current_dj_user_id: fields.currentDjUserId,
      },
      { onConflict: "venue_id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return toRoomState(data as Row);
}
