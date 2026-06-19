import { NextResponse } from "next/server";
import { enqueue, removeQueueItem, listQueue } from "@/lib/dj/repo";
import { broadcastToVenue } from "@/lib/realtime/server-broadcast";
import { VENUE_CHANGED_EVENT } from "@/lib/sync/channels";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

/** Add to your queue. Body: { userId, mediaId, title?, thumbnail? }. */
export async function POST(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const body = (await req.json()) as {
    userId: string;
    mediaId: string;
    title?: string;
    thumbnail?: string;
  };
  if (!body.userId || !body.mediaId) {
    return NextResponse.json({ error: "userId and mediaId required" }, { status: 400 });
  }
  const item = await enqueue(venueId, body.userId, {
    mediaId: body.mediaId,
    title: body.title,
    thumbnail: body.thumbnail,
  });
  await broadcastToVenue(venueId, VENUE_CHANGED_EVENT, { reason: "queue" });
  return NextResponse.json({ item, myQueue: await listQueue(venueId, body.userId) });
}

/** Remove one of your queued items. Body: { itemId, userId }. */
export async function DELETE(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const body = (await req.json()) as { itemId: string; userId: string };
  if (!body.itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }
  await removeQueueItem(body.itemId);
  await broadcastToVenue(venueId, VENUE_CHANGED_EVENT, { reason: "queue" });
  return NextResponse.json({ myQueue: await listQueue(venueId, body.userId) });
}
