import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/auth/server";
import { getRoomState } from "@/lib/sync/room-state-repo";
import { getVenue, listSeats, listQueue, listVotes } from "@/lib/dj/repo";
import { tally } from "@/lib/dj/rotation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

/**
 * Venue snapshot for a client. When the caller is signed in, includes their own
 * queue. Clients refetch this on a `venue:changed` broadcast.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const userId = await getAuthedUserId(req);

  const venue = await getVenue(venueId);
  if (!venue) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [seats, roomState] = await Promise.all([
    listSeats(venueId),
    getRoomState(venueId),
  ]);

  const voteTally = roomState?.currentPlayId
    ? tally(await listVotes(roomState.currentPlayId))
    : null;

  const myQueue = userId ? await listQueue(venueId, userId) : [];

  return NextResponse.json({ venue, seats, roomState, tally: voteTally, myQueue });
}
