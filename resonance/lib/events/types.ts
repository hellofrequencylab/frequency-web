export type TicketType = "free" | "paid" | "pwyc";

export interface ResonanceEvent {
  id: string;
  worldId: string;
  venueId: string | null;
  hostUserId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  ticketType: TicketType;
  priceCents: number | null;
  capacity: number | null;
}

export interface EventTicket {
  id: string;
  eventId: string;
  userId: string;
  amountCents: number;
  status: "confirmed" | "reserved";
}

export interface EventSummary extends ResonanceEvent {
  ticketCount: number;
  myTicket: EventTicket | null;
}
