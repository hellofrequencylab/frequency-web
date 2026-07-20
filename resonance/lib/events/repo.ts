import { createServerClient } from "@/lib/supabase/server";
import type {
  ResonanceEvent,
  EventTicket,
  EventSummary,
  TicketType,
} from "./types";

/**
 * Server-side data access for scheduled events and simple ticketing (build plan
 * §10). Service-role only; never import into a Client Component. Plain CRUD
 * within the `resonance` schema.
 */

// ---- events ----------------------------------------------------------------

export async function createEvent(
  worldId: string,
  hostUserId: string,
  fields: {
    title: string;
    startsAt: string;
    venueId?: string | null;
    description?: string | null;
    ticketType?: TicketType;
    priceCents?: number | null;
    capacity?: number | null;
    endsAt?: string | null;
  },
): Promise<ResonanceEvent> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      world_id: worldId,
      host_user_id: hostUserId,
      title: fields.title,
      starts_at: fields.startsAt,
      venue_id: fields.venueId ?? null,
      description: fields.description ?? null,
      ends_at: fields.endsAt ?? null,
      ticket_type: fields.ticketType ?? "free",
      price_cents: fields.priceCents ?? null,
      capacity: fields.capacity ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toEvent(data);
}

export async function getEvent(eventId: string): Promise<ResonanceEvent | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data ? toEvent(data) : null;
}

/**
 * Upcoming events in a world (anything that hasn't already finished within the
 * last hour), with ticket counts and the caller's own ticket if they hold one.
 */
export async function listUpcomingEvents(
  worldId: string,
  userId: string | null,
): Promise<EventSummary[]> {
  const supabase = createServerClient();
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .eq("world_id", worldId)
    .gte("starts_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw error;
  const ids = (events ?? []).map((e) => e.id as string);
  if (ids.length === 0) return [];

  const { data: tickets, error: ticketsError } = await supabase
    .from("event_tickets")
    .select("*")
    .in("event_id", ids);
  if (ticketsError) throw ticketsError;

  const counts = new Map<string, number>();
  const mine = new Map<string, EventTicket>();
  (tickets ?? []).forEach((t) => {
    const eventId = t.event_id as string;
    counts.set(eventId, (counts.get(eventId) ?? 0) + 1);
    if (userId && (t.user_id as string) === userId) {
      mine.set(eventId, toTicket(t));
    }
  });

  return (events ?? []).map((e) => ({
    ...toEvent(e),
    ticketCount: counts.get(e.id as string) ?? 0,
    myTicket: mine.get(e.id as string) ?? null,
  }));
}

// ---- tickets ---------------------------------------------------------------

/**
 * Claim a ticket for the caller. Free events confirm immediately; paid/pwyc are
 * recorded 'reserved' until Phase 2 payment capture. Honors capacity: a new
 * claimant is rejected once the event is full, but an existing holder can update
 * their ticket. Idempotent via the (event_id, user_id) upsert.
 */
export async function claimTicket(
  eventId: string,
  userId: string,
  amountCents: number,
): Promise<EventTicket> {
  const supabase = createServerClient();
  // Capacity check and ticket insert happen ATOMICALLY in the DB (RPC
  // `resonance.claim_ticket`, migration 0016), serialized by a per-event advisory
  // lock. This closes the count-then-upsert TOCTOU where two concurrent claimants
  // could both pass the capacity check and oversell the event. The RPC derives
  // status from the event's ticket_type and raises 'at capacity' / 'event not
  // found', which the caller surfaces (the route maps 'at capacity' -> 409).
  const { data, error } = await supabase.rpc("claim_ticket", {
    p_event_id: eventId,
    p_user_id: userId,
    p_amount_cents: amountCents,
  });
  if (error) throw new Error(error.message);
  return toTicket(data as Record<string, unknown>);
}

// ---- mappers ---------------------------------------------------------------

function toEvent(r: Record<string, unknown>): ResonanceEvent {
  return {
    id: r.id as string,
    worldId: r.world_id as string,
    venueId: (r.venue_id as string | null) ?? null,
    hostUserId: r.host_user_id as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    startsAt: r.starts_at as string,
    endsAt: (r.ends_at as string | null) ?? null,
    ticketType: r.ticket_type as TicketType,
    priceCents: (r.price_cents as number | null) ?? null,
    capacity: (r.capacity as number | null) ?? null,
  };
}

function toTicket(r: Record<string, unknown>): EventTicket {
  return {
    id: r.id as string,
    eventId: r.event_id as string,
    userId: r.user_id as string,
    amountCents: r.amount_cents as number,
    status: r.status as EventTicket["status"],
  };
}
