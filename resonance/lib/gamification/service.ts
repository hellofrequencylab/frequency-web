import { listVoteDetails } from "@/lib/dj/repo";
import { broadcastToVenue } from "@/lib/realtime/server-broadcast";
import { ZAPS_AWARDED_EVENT, RANK_CHANGED_EVENT } from "@/lib/sync/channels";
import {
  getOrCreateCurrentSeason,
  awardZaps,
  addDjPoints,
} from "./repo";

/**
 * Award a DJ for a finished play (spec §9, anti-gaming).
 *
 * - VERIFIED PLAY-THROUGH ONLY: called from `advance`, i.e. when a play actually
 *   finished — never on queuing or RSVP.
 * - Award = Awesome votes from OTHER people. The DJ's own vote is excluded, so
 *   self-dealing earns nothing.
 * - Idempotent: the ledger's unique (reason, ref=play) key means a replayed
 *   `advance` cannot double-pay; reputation only moves when the award is new.
 *
 * Returns the award amount (0 if none / already awarded).
 */
export async function awardForPlay(
  worldId: string,
  venueId: string,
  playId: string,
  djUserId: string,
): Promise<number> {
  const votes = await listVoteDetails(playId);
  const awesome = votes.filter(
    (v) => v.value === "awesome" && v.userId !== djUserId,
  ).length;
  if (awesome <= 0) return 0;

  const newlyAwarded = await awardZaps(worldId, djUserId, awesome, "vote_received", playId);
  if (!newlyAwarded) return 0; // already paid for this play

  const season = await getOrCreateCurrentSeason(worldId);
  const { rank } = await addDjPoints(worldId, djUserId, season.id, awesome);

  await broadcastToVenue(venueId, ZAPS_AWARDED_EVENT, {
    userId: djUserId,
    delta: awesome,
    reason: "vote_received",
    refId: playId,
  });
  await broadcastToVenue(venueId, RANK_CHANGED_EVENT, {
    userId: djUserId,
    rank,
    seasonId: season.id,
  });
  return awesome;
}
