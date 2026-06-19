import { NextResponse } from "next/server";
import { getVenue, listSeats, takeSeat, leaveSeat } from "@/lib/dj/repo";
import { firstFreeSeat } from "@/lib/dj/rotation";
import { broadcastToVenue } from "@/lib/realtime/server-broadcast";
import { VENUE_CHANGED_EVENT } from "@/lib/sync/channels";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

/**
 * Take or leave a DJ seat. Body: { action: "take" | "leave", userId, seatIndex? }.
 *
 * NOTE: userId comes from the client for now (no auth yet — Section 3). Once auth
 * lands it MUST derive from the verified session, never the request body.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const body = (await req.json()) as {
    action: "take" | "leave";
    userId: string;
    seatIndex?: number;
  };
  if (!body.userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  if (body.action === "leave") {
    await leaveSeat(venueId, body.userId);
  } else if (body.action === "take") {
    const venue = await getVenue(venueId);
    if (!venue) return NextResponse.json({ error: "not found" }, { status: 404 });
    const taken = (await listSeats(venueId)).map((s) => s.seatIndex);
    const seatIndex = body.seatIndex ?? firstFreeSeat(taken, venue.seatCount);
    if (seatIndex === null) {
      return NextResponse.json({ error: "stage full" }, { status: 409 });
    }
    await takeSeat(venueId, seatIndex, body.userId);
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  await broadcastToVenue(venueId, VENUE_CHANGED_EVENT, { reason: "seats" });
  return NextResponse.json({ seats: await listSeats(venueId) });
}
