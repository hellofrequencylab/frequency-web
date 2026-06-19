/**
 * Shared naming for the realtime seam, used by both the browser subscriber and
 * the server broadcaster so they always agree on topic + event names.
 */

/** Realtime topic (channel name) for a venue's live room. */
export function venueTopic(venueId: string): string {
  return `venue:${venueId}`;
}

/** Broadcast event carrying a new authoritative RoomState. */
export const ROOM_UPDATE_EVENT = "room:update";

/** Seats/queue changed; subscribers refetch the venue snapshot. */
export const VENUE_CHANGED_EVENT = "venue:changed";

/** Live vote aggregate for the current play: { playId, awesome, lame }. */
export const VOTE_TALLY_EVENT = "vote:tally";

/** Client-to-client chat line: { userId, text, at }. Not persisted (ephemeral). */
export const CHAT_EVENT = "chat:message";

/** A DJ earned Zaps on a finished play: { userId, delta, reason, refId }.
 * Also the server-to-server mirror payload for the host economy (Section 5). */
export const ZAPS_AWARDED_EVENT = "zaps:awarded";

/** A user's Field rank changed: { userId, rank, seasonId }. */
export const RANK_CHANGED_EVENT = "rank:changed";
