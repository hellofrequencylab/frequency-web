import { createServerClient } from "@/lib/supabase/server";
import type { Venue, VenueSummary, SeatRow, QueueItem, MediaType, DecorItem } from "./types";

/**
 * Server-side data access for the DJ loop. Service-role only; never import into
 * a Client Component. All writes that carry rules (rotation, tally) go through
 * the service layer, not here — this is plain CRUD within the `resonance` schema.
 */

// ---- venues ----------------------------------------------------------------

export async function createVenue(
  worldId: string,
  fields: {
    name: string;
    seatCount?: number;
    theme?: string;
    mediaType?: MediaType;
    playlist?: string[];
  },
): Promise<Venue> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("venues")
    .insert({
      world_id: worldId,
      name: fields.name,
      seat_count: fields.seatCount ?? 5,
      theme: fields.theme ?? null,
      media_type: fields.mediaType ?? "dj",
      playlist: fields.playlist ?? [],
    })
    .select("*")
    .single();
  if (error) throw error;
  return toVenue(data);
}

/** Append a track to a lounge's ambient playlist (community jukebox). */
export async function addToPlaylist(venueId: string, mediaId: string): Promise<string[]> {
  const supabase = createServerClient();
  const venue = await getVenue(venueId);
  const next = [...(venue?.playlist ?? []), mediaId];
  const { error } = await supabase.from("venues").update({ playlist: next }).eq("id", venueId);
  if (error) throw error;
  return next;
}

/** Persist a venue's decor layout (build plan §13). */
export async function updateVenueDecor(venueId: string, decor: DecorItem[]): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase.from("venues").update({ decor }).eq("id", venueId);
  if (error) throw error;
}

/** All venues in a world with lightweight activity signals, for the lobby. */
export async function listVenues(worldId: string): Promise<VenueSummary[]> {
  const supabase = createServerClient();
  const { data: venues, error } = await supabase
    .from("venues")
    .select("*")
    .eq("world_id", worldId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const ids = (venues ?? []).map((v) => v.id as string);
  if (ids.length === 0) return [];

  const since = new Date(Date.now() - 45_000).toISOString();
  const [{ data: seats }, { data: rooms }, { data: pings }] = await Promise.all([
    supabase.from("venue_seats").select("venue_id").in("venue_id", ids),
    supabase.from("room_state").select("venue_id, is_playing").in("venue_id", ids),
    supabase
      .from("presence_pings")
      .select("venue_id, user_id")
      .in("venue_id", ids)
      .gt("last_seen", since),
  ]);

  const djs = new Map<string, number>();
  (seats ?? []).forEach((s) =>
    djs.set(s.venue_id as string, (djs.get(s.venue_id as string) ?? 0) + 1),
  );
  const playing = new Map<string, boolean>();
  (rooms ?? []).forEach((r) => playing.set(r.venue_id as string, r.is_playing as boolean));

  // Count distinct present users per venue (a stale row can't be double-counted
  // because the primary key is (venue_id, user_id), but stay defensive in JS).
  const present = new Map<string, Set<string>>();
  (pings ?? []).forEach((p) => {
    const vid = p.venue_id as string;
    const set = present.get(vid) ?? new Set<string>();
    set.add(p.user_id as string);
    present.set(vid, set);
  });

  return (venues ?? []).map((v) => ({
    ...toVenue(v),
    djs: djs.get(v.id as string) ?? 0,
    isPlaying: playing.get(v.id as string) ?? false,
    here: present.get(v.id as string)?.size ?? 0,
  }));
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

/** Votes with voter id, for award logic that must exclude the DJ's own vote. */
export async function listVoteDetails(
  playId: string,
): Promise<Array<{ userId: string; value: "awesome" | "lame" }>> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("votes")
    .select("user_id, value")
    .eq("play_id", playId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.user_id as string,
    value: r.value as "awesome" | "lame",
  }));
}

// ---- mappers ---------------------------------------------------------------

function toVenue(r: Record<string, unknown>): Venue {
  return {
    id: r.id as string,
    worldId: r.world_id as string,
    name: r.name as string,
    theme: (r.theme as string | null) ?? null,
    mediaType: r.media_type as Venue["mediaType"],
    seatCount: r.seat_count as number,
    playlist: (r.playlist as string[] | null) ?? [],
    decor: (r.decor as DecorItem[] | null) ?? [],
    level: (r.level as number | null) ?? 1,
    createdBy: (r.created_by as string | null) ?? null,
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
