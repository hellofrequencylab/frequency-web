import type { RoomState } from "@/lib/sync/types";
import { getRoomState, applyPlayback } from "@/lib/sync/room-state-repo";
import { startTrack, IDLE } from "@/lib/sync/clock";
import { broadcastToVenue } from "@/lib/realtime/server-broadcast";
import { ROOM_UPDATE_EVENT, VENUE_CHANGED_EVENT } from "@/lib/sync/channels";
import { getVenue, listSeats, leaveSeat, listVotes, nextQueuedItem, markPlayed } from "./repo";
import { tally, shouldBump } from "./rotation";
import { awardForPlay } from "@/lib/gamification/service";

/**
 * Ambient auto-DJ for a lounge (spec §3.1 — the empty-room killer). Loops the
 * venue's playlist with no human DJ, so the room is live the moment anyone walks
 * in. Server-authoritative, like `advance`.
 *
 * - Called on entry with no `expectedPlayId`: if already playing, no-op (someone
 *   beat us to starting it); otherwise start at the top.
 * - Called on track-end with the finishing `expectedPlayId`: step to the next
 *   track, wrapping around. Stale play ids are ignored (idempotent).
 */
export async function advanceLounge(
  venueId: string,
  expectedPlayId?: string | null,
): Promise<RoomState> {
  const venue = await getVenue(venueId);
  const playlist = venue?.playlist ?? [];
  const current = await getRoomState(venueId);

  // Already live and this is just another arrival -> leave it alone.
  if (!expectedPlayId && current?.isPlaying && current.currentMediaId) return current;
  // A track-end from a play that already moved on -> someone else advanced.
  if (expectedPlayId && current?.currentPlayId && expectedPlayId !== current.currentPlayId) {
    return current;
  }

  if (playlist.length === 0) {
    const state = await applyPlayback(venueId, { ...IDLE }, null);
    await broadcastToVenue(venueId, ROOM_UPDATE_EVENT, state);
    return state;
  }

  const curIdx = current?.currentMediaId ? playlist.indexOf(current.currentMediaId) : -1;
  const nextIdx = expectedPlayId ? (curIdx + 1) % playlist.length : Math.max(curIdx, 0);
  const mediaId = playlist[nextIdx];

  const state = await applyPlayback(
    venueId,
    startTrack(mediaId, Date.now(), null),
    crypto.randomUUID(),
  );
  await broadcastToVenue(venueId, ROOM_UPDATE_EVENT, state);
  await broadcastToVenue(venueId, VENUE_CHANGED_EVENT, { reason: "lounge" });
  return state;
}

/**
 * Advance the floor to the next DJ (spec §5.1). Server-authoritative: this is the
 * ONLY place rotation happens.
 *
 * 1. Tally the finishing play; if the room netted negative, the DJ is bumped off
 *    their seat.
 * 2. Starting after the current DJ, round-robin to the next DJ who has a queued
 *    track; mark it played and make it the current play (fresh play id).
 * 3. If nobody is seated or no one has a track, the room goes idle.
 *
 * `expectedPlayId` makes concurrent callers idempotent: if the current play has
 * already moved on, this is a no-op (whoever called first already advanced).
 */
export async function advance(
  venueId: string,
  expectedPlayId?: string | null,
): Promise<RoomState> {
  const current = await getRoomState(venueId);

  if (
    expectedPlayId &&
    current?.currentPlayId &&
    expectedPlayId !== current.currentPlayId
  ) {
    return current;
  }

  // 1. Settle the finishing play: award Zaps for verified play-through (Awesome
  //    votes from others), then decide whether the DJ keeps their seat.
  let bumped: string | null = null;
  if (current?.currentPlayId && current.currentDjUserId) {
    const venue = await getVenue(venueId);
    if (venue) {
      await awardForPlay(venue.worldId, venueId, current.currentPlayId, current.currentDjUserId);
    }
    const t = tally(await listVotes(current.currentPlayId));
    if (shouldBump(t)) bumped = current.currentDjUserId;
  }
  if (bumped) await leaveSeat(venueId, bumped);

  const seats = (await listSeats(venueId)).sort((a, b) => a.seatIndex - b.seatIndex);

  // 2. Round-robin from after the current DJ to the next one with a track.
  const startIdx = (() => {
    if (!current?.currentDjUserId) return 0;
    const i = seats.findIndex((s) => s.occupantUserId === current.currentDjUserId);
    return i === -1 ? 0 : (i + 1) % Math.max(seats.length, 1);
  })();

  let chosen: { dj: string; itemId: string; mediaId: string } | null = null;
  for (let k = 0; k < seats.length; k++) {
    const dj = seats[(startIdx + k) % seats.length].occupantUserId;
    const item = await nextQueuedItem(venueId, dj);
    if (item) {
      chosen = { dj, itemId: item.id, mediaId: item.mediaId };
      break;
    }
  }

  // 3. Nobody to play -> idle.
  if (!chosen) {
    const state = await applyPlayback(venueId, { ...IDLE }, null);
    await broadcastToVenue(venueId, ROOM_UPDATE_EVENT, state);
    await broadcastToVenue(venueId, VENUE_CHANGED_EVENT, { reason: "advance" });
    return state;
  }

  await markPlayed(chosen.itemId);
  const state = await applyPlayback(
    venueId,
    startTrack(chosen.mediaId, Date.now(), chosen.dj),
    crypto.randomUUID(),
  );
  await broadcastToVenue(venueId, ROOM_UPDATE_EVENT, state);
  await broadcastToVenue(venueId, VENUE_CHANGED_EVENT, { reason: "advance" });
  return state;
}
