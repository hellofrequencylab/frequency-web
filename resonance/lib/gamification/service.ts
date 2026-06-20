import { listVoteDetails } from "@/lib/dj/repo";
import { broadcastToVenue } from "@/lib/realtime/server-broadcast";
import { mirrorToHost } from "@/lib/webhooks/host-mirror";
import { ZAPS_AWARDED_EVENT, RANK_CHANGED_EVENT } from "@/lib/sync/channels";
import {
  getOrCreateCurrentSeason,
  awardZaps,
  addDjPoints,
  getBalance,
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

  const zapsEvent = {
    type: ZAPS_AWARDED_EVENT,
    userId: djUserId,
    delta: awesome,
    reason: "vote_received",
    refId: playId,
  };
  const rankEvent = {
    type: RANK_CHANGED_EVENT,
    userId: djUserId,
    rank,
    seasonId: season.id,
  };

  // In-venue broadcast (live UI) + server-to-server mirror to the host economy.
  await broadcastToVenue(venueId, ZAPS_AWARDED_EVENT, zapsEvent);
  await broadcastToVenue(venueId, RANK_CHANGED_EVENT, rankEvent);
  await mirrorToHost(zapsEvent);
  await mirrorToHost(rankEvent);
  return awesome;
}

/**
 * Spend Zaps (e.g. a marketplace purchase). Reads balance the same way standing
 * does (sum of the `zaps_ledger` deltas via `getBalance`), then debits by
 * appending a NEGATIVE `purchase` row through the existing `awardZaps` path. The
 * ledger stays append-only and balance = sum(delta) remains the source of truth.
 *
 * - If the balance can't cover `amount`, returns { ok: false } WITHOUT debiting.
 * - Idempotent on (reason, refId): the ledger's unique key means a retried spend
 *   for the same refId debits at most once. Pass a stable refId (e.g. the item
 *   id) to make a purchase safe to retry.
 *
 * Returns the resulting balance either way.
 */
export async function spendZaps(
  worldId: string,
  userId: string,
  amount: number,
  reason: "purchase" | "reward",
  refId: string,
): Promise<{ ok: boolean; balance: number }> {
  const balance = await getBalance(worldId, userId);
  if (balance < amount) return { ok: false, balance };

  const newlyRecorded = await awardZaps(worldId, userId, -amount, reason, refId);
  if (!newlyRecorded) {
    // Already debited for this refId — report current balance, don't double-charge.
    return { ok: true, balance: await getBalance(worldId, userId) };
  }
  return { ok: true, balance: balance - amount };
}
