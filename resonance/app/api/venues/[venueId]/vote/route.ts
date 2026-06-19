import { NextResponse } from "next/server";
import { getRoomState } from "@/lib/sync/room-state-repo";
import { castVote, listVotes } from "@/lib/dj/repo";
import { tally } from "@/lib/dj/rotation";
import { broadcastToVenue } from "@/lib/realtime/server-broadcast";
import { VOTE_TALLY_EVENT } from "@/lib/sync/channels";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

/**
 * Vote on the current play. Body: { userId, value: "awesome" | "lame" }.
 * Enforced one-per-(play,user) by the DB; re-voting changes the value. Votes
 * never land on the act of queuing — only on the play in progress (anti-gaming).
 */
export async function POST(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const body = (await req.json()) as {
    userId: string;
    value: "awesome" | "lame";
  };
  if (!body.userId || (body.value !== "awesome" && body.value !== "lame")) {
    return NextResponse.json({ error: "userId and value required" }, { status: 400 });
  }

  const room = await getRoomState(venueId);
  if (!room?.currentPlayId) {
    return NextResponse.json({ error: "nothing playing" }, { status: 409 });
  }

  await castVote(venueId, room.currentPlayId, body.userId, body.value);
  const voteTally = tally(await listVotes(room.currentPlayId));
  await broadcastToVenue(venueId, VOTE_TALLY_EVENT, {
    playId: room.currentPlayId,
    ...voteTally,
  });
  return NextResponse.json({ tally: voteTally });
}
