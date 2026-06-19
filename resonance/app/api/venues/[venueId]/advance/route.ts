import { NextResponse } from "next/server";
import { advance, advanceLounge } from "@/lib/dj/service";
import { getVenue } from "@/lib/dj/repo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

/**
 * Move playback forward. Body: { playId? }. The optional playId makes concurrent
 * callers idempotent (the player hitting end-of-track and a manual "Next" can
 * both fire without double-advancing). A lounge steps its ambient playlist; any
 * other venue rotates to the next DJ.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { playId?: string };
  const venue = await getVenue(venueId);
  const state =
    venue?.mediaType === "lounge"
      ? await advanceLounge(venueId, body.playId ?? null)
      : await advance(venueId, body.playId ?? null);
  return NextResponse.json({ state });
}
