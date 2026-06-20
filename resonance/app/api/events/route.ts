import { NextResponse } from "next/server";
import { createEvent, listUpcomingEvents } from "@/lib/events/repo";
import { getAuthedUserId } from "@/lib/auth/server";
import { DEMO_WORLD_ID } from "@/lib/constants";
import type { TicketType } from "@/lib/events/types";

export const dynamic = "force-dynamic";

/** Upcoming events in the world, with ticket counts and the caller's ticket. */
export async function GET(req: Request) {
  const userId = await getAuthedUserId(req);
  const events = await listUpcomingEvents(DEMO_WORLD_ID, userId);
  return NextResponse.json({ events });
}

const TICKET_TYPES: TicketType[] = ["free", "paid", "pwyc"];

/**
 * Create an event. Body: { title, startsAt, venueId?, description?, ticketType?,
 * priceCents?, capacity? }. The caller hosts it.
 */
export async function POST(req: Request) {
  const userId = await getAuthedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    title?: string;
    startsAt?: string;
    venueId?: string;
    description?: string;
    ticketType?: TicketType;
    priceCents?: number;
    capacity?: number;
  };
  if (!body.title || !body.startsAt) {
    return NextResponse.json(
      { error: "title and startsAt required" },
      { status: 400 },
    );
  }
  const ticketType =
    body.ticketType && TICKET_TYPES.includes(body.ticketType)
      ? body.ticketType
      : "free";
  const event = await createEvent(DEMO_WORLD_ID, userId, {
    title: body.title,
    startsAt: body.startsAt,
    venueId: body.venueId,
    description: body.description,
    ticketType,
    priceCents: body.priceCents,
    capacity: body.capacity,
  });
  return NextResponse.json({ event });
}
