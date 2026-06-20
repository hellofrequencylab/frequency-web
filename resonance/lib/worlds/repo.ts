import { createServerClient } from "@/lib/supabase/server";
import type { World, WorldActivity, DiscoverFeed } from "./types";

/**
 * Server-side data access for cross-world discovery (build plan §18). An
 * ADDITIVE read path: it aggregates live venues and upcoming events across ALL
 * worlds. Service-role only; never import into a Client Component.
 *
 * Mirrors the listVenues aggregation style (lib/dj/repo.ts): a small number of
 * batched queries, joined in JS keyed by id. It does NOT import the per-world
 * repos — the per-world surfaces stay scoped to one world.
 */

export async function listWorlds(): Promise<World[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("worlds")
    .select("id, name, slug")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toWorld);
}

/**
 * The "happening now across worlds" feed. For every world, computes:
 *   - liveVenues: venues with a playing room_state OR a presence ping in the
 *     last 45s;
 *   - hereNow: distinct users with a presence ping in the last 45s across the
 *     world's venues;
 *   - upcoming: up to 3 nearest future events (starts_at >= now()).
 * Worlds are sorted by hereNow desc, then name.
 */
export async function discover(): Promise<DiscoverFeed> {
  const supabase = createServerClient();

  const { data: worlds, error } = await supabase
    .from("worlds")
    .select("id, name, slug");
  if (error) throw error;
  if (!worlds || worlds.length === 0) return { worlds: [] };

  // venue_id -> world_id, so presence/room signals can roll up to a world.
  const { data: venues } = await supabase
    .from("venues")
    .select("id, world_id");
  const venueWorld = new Map<string, string>();
  (venues ?? []).forEach((v) => venueWorld.set(v.id as string, v.world_id as string));
  const venueIds = (venues ?? []).map((v) => v.id as string);

  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - 45_000).toISOString();

  const [{ data: rooms }, { data: pings }, { data: events }] = await Promise.all([
    venueIds.length
      ? supabase
          .from("room_state")
          .select("venue_id, is_playing")
          .in("venue_id", venueIds)
      : Promise.resolve({ data: [] as { venue_id: string; is_playing: boolean }[] }),
    venueIds.length
      ? supabase
          .from("presence_pings")
          .select("venue_id, user_id")
          .in("venue_id", venueIds)
          .gt("last_seen", since)
      : Promise.resolve({ data: [] as { venue_id: string; user_id: string }[] }),
    supabase
      .from("events")
      .select("id, world_id, title, starts_at")
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true }),
  ]);

  // Venues that count as live: a playing room, or a fresh ping.
  const liveVenueIds = new Set<string>();
  (rooms ?? []).forEach((r) => {
    if (r.is_playing) liveVenueIds.add(r.venue_id as string);
  });
  (pings ?? []).forEach((p) => liveVenueIds.add(p.venue_id as string));

  // Roll up per-world signals.
  const liveVenues = new Map<string, number>();
  liveVenueIds.forEach((vid) => {
    const wid = venueWorld.get(vid);
    if (wid) liveVenues.set(wid, (liveVenues.get(wid) ?? 0) + 1);
  });

  // Distinct present users per world (defensive de-dupe across venues).
  const present = new Map<string, Set<string>>();
  (pings ?? []).forEach((p) => {
    const wid = venueWorld.get(p.venue_id as string);
    if (!wid) return;
    const set = present.get(wid) ?? new Set<string>();
    set.add(p.user_id as string);
    present.set(wid, set);
  });

  // Up to 3 nearest future events per world (events are pre-sorted ascending).
  const upcoming = new Map<string, WorldActivity["upcoming"]>();
  (events ?? []).forEach((e) => {
    const wid = e.world_id as string;
    const list = upcoming.get(wid) ?? [];
    if (list.length < 3) {
      list.push({
        id: e.id as string,
        title: e.title as string,
        startsAt: e.starts_at as string,
      });
      upcoming.set(wid, list);
    }
  });

  const activity: WorldActivity[] = worlds.map((w) => {
    const id = w.id as string;
    return {
      world: toWorld(w),
      liveVenues: liveVenues.get(id) ?? 0,
      hereNow: present.get(id)?.size ?? 0,
      upcoming: upcoming.get(id) ?? [],
    };
  });

  activity.sort((a, b) => b.hereNow - a.hereNow || a.world.name.localeCompare(b.world.name));

  return { worlds: activity };
}

function toWorld(r: Record<string, unknown>): World {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
  };
}
