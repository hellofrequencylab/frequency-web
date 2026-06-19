import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/auth/server";
import { getRoomState } from "@/lib/sync/room-state-repo";
import { castVote, listVotes } from "@/lib/dj/repo";
import { tally } from "@/lib/dj/rotation";
import { broadcastToVenue } from "@/lib/realtime/server-broadcast";
import { VOTE_TALLY_EVENT } from "@/lib/sync/channels";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

/**
 * Vote on the current play. Body: { value: "awesome" | "lame" }. Reacting is
 * first-class, so any signed-in user (including guests) can vote. One per
 * (play, user), DB-enforced; re-voting changes the value. Votes only ever land
 * on the play in progress, never on queuing (anti-gaming).
 */
export async function POST(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { value: "awesome" | "lame" };
  if (body.value !== "awesome" && body.value !== "lame") {
    return NextResponse.json({ error: "value required" }, { status: 400 });
  }

  const room = await getRoomState(venueId);
  if (!room?.currentPlayId) {
    return NextResponse.json({ error: "nothing playing" }, { status: 409 });
  }

  await castVote(venueId, room.currentPlayId, userId, body.value);
  const voteTally = tally(await listVotes(room.currentPlayId));
  await broadcastToVenue(venueId, VOTE_TALLY_EVENT, {
    playId: room.currentPlayId,
    ...voteTally,
  });
  return NextResponse.json({ tally: voteTally });
}
