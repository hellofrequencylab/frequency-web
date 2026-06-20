import { NextResponse } from "next/server";
import { claimTicket } from "@/lib/events/repo";
import { getAuthedUserId } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ eventId: string }> };

/**
 * Claim a ticket for an event (RSVP for free, get/reserve for paid, name your
 * price for pwyc). Body: { amountCents? }. The caller's identity comes from the
 * verified JWT.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { eventId } = await ctx.params;
  const userId = await getAuthedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { amountCents?: number };
  try {
    const ticket = await claimTicket(eventId, userId, body.amountCents ?? 0);
    return NextResponse.json({ ticket });
  } catch (err) {
    if (err instanceof Error && err.message === "at capacity") {
      return NextResponse.json({ error: "at capacity" }, { status: 409 });
    }
    throw err;
  }
}
