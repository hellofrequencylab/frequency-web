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
