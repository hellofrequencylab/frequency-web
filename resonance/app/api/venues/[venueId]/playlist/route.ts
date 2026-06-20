import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/auth/server";
import { addToPlaylist } from "@/lib/dj/repo";
import { broadcastToVenue } from "@/lib/realtime/server-broadcast";
import { VENUE_CHANGED_EVENT } from "@/lib/sync/channels";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

/** Add a track to a lounge's ambient playlist (community jukebox). */
export async function POST(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { mediaId?: string };
  if (!body.mediaId) return NextResponse.json({ error: "mediaId required" }, { status: 400 });

  const playlist = await addToPlaylist(venueId, body.mediaId);
  await broadcastToVenue(venueId, VENUE_CHANGED_EVENT, { reason: "playlist" });
  return NextResponse.json({ playlist });
}
