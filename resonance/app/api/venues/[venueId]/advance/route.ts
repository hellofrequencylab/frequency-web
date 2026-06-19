import { NextResponse } from "next/server";
import { advance } from "@/lib/dj/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ venueId: string }> };

/**
 * Move the floor to the next DJ. Body: { playId? }. The optional playId makes
 * concurrent callers idempotent (the player that hits the end of a track and a
 * manual "Next" can both fire without double-advancing).
 */
export async function POST(req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { playId?: string };
  const state = await advance(venueId, body.playId ?? null);
  return NextResponse.json({ state });
}
