import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/auth/server";
import { getProfile } from "@/lib/profiles/repo";
import { getVenue, listSeats, takeSeat, leaveSeat } from "@/lib/dj/repo";
import { firstFreeSeat } from "@/lib/dj/rotation";
import { broadcastToVenue } from "@/lib/realtime/server-broadcast";
import { VENUE_CHANGED_EVENT } from "@/lib/sync/channels";
import { DEMO_WORLD_ID } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

/**
 * Take or leave a DJ seat. Body: { action: "take" | "leave", seatIndex? }.
 * Identity comes from the verified token. Taking the decks requires a profile
 * (the lurker -> DJ on-ramp); leaving never does.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    action: "take" | "leave";
    seatIndex?: number;
  };

  if (body.action === "leave") {
    await leaveSeat(venueId, userId);
  } else if (body.action === "take") {
    const profile = await getProfile(DEMO_WORLD_ID, userId);
    if (!profile) {
      return NextResponse.json(
        { error: "set a display name before taking the decks" },
        { status: 403 },
      );
    }
    const venue = await getVenue(venueId);
    if (!venue) return NextResponse.json({ error: "not found" }, { status: 404 });
    const taken = (await listSeats(venueId)).map((s) => s.seatIndex);
    const seatIndex = body.seatIndex ?? firstFreeSeat(taken, venue.seatCount);
    if (seatIndex === null) {
      return NextResponse.json({ error: "stage full" }, { status: 409 });
    }
    await takeSeat(venueId, seatIndex, userId);
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  await broadcastToVenue(venueId, VENUE_CHANGED_EVENT, { reason: "seats" });
  return NextResponse.json({ seats: await listSeats(venueId) });
}
