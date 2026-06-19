import { NextResponse } from "next/server";
import { getAuthedUserId } from "@/lib/auth/server";
import { enqueue, removeQueueItem, listQueue } from "@/lib/dj/repo";
import { broadcastToVenue } from "@/lib/realtime/server-broadcast";
import { VENUE_CHANGED_EVENT } from "@/lib/sync/channels";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

/** Add to your queue. Body: { mediaId, title?, thumbnail? }. */
export async function POST(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    mediaId: string;
    title?: string;
    thumbnail?: string;
  };
  if (!body.mediaId) {
    return NextResponse.json({ error: "mediaId required" }, { status: 400 });
  }
  const item = await enqueue(venueId, userId, {
    mediaId: body.mediaId,
    title: body.title,
    thumbnail: body.thumbnail,
  });
  await broadcastToVenue(venueId, VENUE_CHANGED_EVENT, { reason: "queue" });
  return NextResponse.json({ item, myQueue: await listQueue(venueId, userId) });
}

/** Remove one of your queued items. Body: { itemId }. */
export async function DELETE(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as { itemId: string };
  if (!body.itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }
  await removeQueueItem(body.itemId);
  await broadcastToVenue(venueId, VENUE_CHANGED_EVENT, { reason: "queue" });
  return NextResponse.json({ myQueue: await listQueue(venueId, userId) });
}
