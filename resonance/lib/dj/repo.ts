import { createServerClient } from "@/lib/supabase/server";
import type { Venue, SeatRow, QueueItem } from "./types";

/**
 * Server-side data access for the DJ loop. Service-role only; never import into
 * a Client Component. All writes that carry rules (rotation, tally) go through
 * the service layer, not here — this is plain CRUD within the `resonance` schema.
 */

// ---- venues ----------------------------------------------------------------

export async function createVenue(
  worldId: string,
  name: string,
  seatCount = 5,
): Promise<Venue> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("venues")
    .insert({ world_id: worldId, name, seat_count: seatCount })
    .select("*")
    .single();
  if (error) throw error;
  return toVenue(data);
}

export async function getVenue(venueId: string): Promise<Venue | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("venues")
    .select("*")
    .eq("id", venueId)
    .maybeSingle();
  if (error) throw error;
  return data ? toVenue(data) : null;
}

// ---- seats -----------------------------------------------------------------

export async function listSeats(venueId: string): Promise<SeatRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("venue_seats")
    .select("seat_index, occupant_user_id, joined_at")
    .eq("venue_id", venueId)
    .order("seat_index");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    seatIndex: r.seat_index as number,
    occupantUserId: r.occupant_user_id as string,
    joinedAt: r.joined_at as string,
  }));
}

export async function takeSeat(
  venueId: string,
  seatIndex: number,
  userId: string,
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("venue_seats")
    .insert({ venue_id: venueId, seat_index: seatIndex, occupant_user_id: userId });
  if (error) throw error;
}

export async function leaveSeat(venueId: string, userId: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("venue_seats")
    .delete()
    .eq("venue_id", venueId)
    .eq("occupant_user_id", userId);
  if (error) throw error;
}

// ---- queue -----------------------------------------------------------------

export async function listQueue(
  venueId: string,
  userId?: string,
): Promise<QueueItem[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("queue_items")
    .select("*")
    .eq("venue_id", venueId)
    .eq("status", "queued")
    .order("position");
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toQueueItem);
}

export async function enqueue(
  venueId: string,
  userId: string,
  media: { mediaId: string; title?: string; thumbnail?: string },
): Promise<QueueItem> {
  const supabase = createServerClient();
  const existing = await listQueue(venueId, userId);
  const position = existing.length
    ? Math.max(...existing.map((q) => q.position)) + 1
    : 0;
  const { data, error } = await supabase
    .from("queue_items")
    .insert({
      venue_id: venueId,
      user_id: userId,
      media_id: media.mediaId,
      title: media.title ?? null,
      thumbnail: media.thumbnail ?? null,
      position,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toQueueItem(data);
}

export async function removeQueueItem(itemId: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from("queue_items").delete().eq("id", itemId);
  if (error) throw error;
}

/** The DJ's next track to play, or null if their queue is empty. */
export async function nextQueuedItem(
  venueId: string,
  userId: string,
): Promise<QueueItem | null> {
  const items = await listQueue(venueId, userId);
  return items[0] ?? null;
}

export async function markPlayed(itemId: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("queue_items")
    .update({ status: "played" })
    .eq("id", itemId);
  if (error) throw error;
}

// ---- votes -----------------------------------------------------------------

export async function castVote(
  venueId: string,
  playId: string,
  userId: string,
  value: "awesome" | "lame",
): Promise<void> {
  const supabase = createServerClient();
  // One row per (play_id, user_id); re-voting updates the value.
  const { error } = await supabase
    .from("votes")
    .upsert(
      { venue_id: venueId, play_id: playId, user_id: userId, value },
      { onConflict: "play_id,user_id" },
    );
  if (error) throw error;
}

export async function listVotes(
  playId: string,
): Promise<Array<{ value: "awesome" | "lame" }>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("votes")
    .select("value")
    .eq("play_id", playId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ value: r.value as "awesome" | "lame" }));
}

// ---- mappers ---------------------------------------------------------------

function toVenue(r: Record<string, unknown>): Venue {
  return {
    id: r.id as string,
    worldId: r.world_id as string,
    name: r.name as string,
    mediaType: r.media_type as Venue["mediaType"],
    seatCount: r.seat_count as number,
  };
}

function toQueueItem(r: Record<string, unknown>): QueueItem {
  return {
    id: r.id as string,
    venueId: r.venue_id as string,
    userId: r.user_id as string,
    mediaId: r.media_id as string,
    mediaProvider: r.media_provider as "youtube",
    title: (r.title as string | null) ?? null,
    thumbnail: (r.thumbnail as string | null) ?? null,
    position: r.position as number,
    status: r.status as QueueItem["status"],
  };
}
