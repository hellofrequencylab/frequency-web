"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/api/fetch";
import type { EventSummary, TicketType } from "@/lib/events/types";
import { AppShell } from "@/components/shell/AppShell";
import { Card, Badge, Button, Field, Input, Select, EmptyState } from "@/components/ui";

async function fetchEvents(): Promise<EventSummary[]> {
  const res = await authedFetch("/api/events", { cache: "no-store" });
  if (!res.ok) return [];
  const j = (await res.json()) as { events: EventSummary[] };
  return j.events;
}

const TYPES: TicketType[] = ["free", "paid", "pwyc"];

const TYPE_LABEL: Record<TicketType, string> = {
  free: "free",
  paid: "paid",
  pwyc: "pay what you can",
};

function claimLabel(type: TicketType): string {
  if (type === "paid") return "Get ticket";
  if (type === "pwyc") return "Name your price";
  return "RSVP";
}

/**
 * Events board (build plan §10). Browse upcoming events and claim a ticket.
 * Free events RSVP instantly. Paid and pay-what-you-can tickets reserve a spot;
 * payment capture arrives in Phase 2.
 */
export default function EventsPage() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [ticketType, setTicketType] = useState<TicketType>("free");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const reload = () => {
    void (async () => {
      const e = await fetchEvents();
      setEvents(e);
    })();
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      const e = await fetchEvents();
      if (active) setEvents(e);
    })();
    return () => {
      active = false;
    };
  }, []);

  const create = async () => {
    if (!title.trim() || !startsAt) return;
    await authedFetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        startsAt: new Date(startsAt).toISOString(),
        ticketType,
        priceCents: price ? Math.round(parseFloat(price) * 100) : undefined,
        capacity: capacity ? parseInt(capacity, 10) : undefined,
      }),
    });
    setTitle("");
    setStartsAt("");
    setTicketType("free");
    setPrice("");
    setCapacity("");
    reload();
  };

  const claim = async (ev: EventSummary) => {
    const body: { amountCents?: number } = {};
    if (ev.ticketType === "pwyc") {
      const dollars = amounts[ev.id];
      body.amountCents = dollars ? Math.round(parseFloat(dollars) * 100) : 0;
    } else if (ev.ticketType === "paid" && ev.priceCents != null) {
      body.amountCents = ev.priceCents;
    }
    const res = await authedFetch(`/api/events/${ev.id}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      alert("This event is at capacity.");
      return;
    }
    reload();
  };

  return (
    <AppShell>
      <h1 className="font-display text-2xl text-text">Events</h1>
      <p className="mt-1 text-sm text-mute">Upcoming sets and gatherings. Claim your spot.</p>

      <div className="mt-6 grid gap-3">
        {events.map((ev) => (
          <Card key={ev.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-lg text-text">{ev.title}</h2>
                <p className="mt-0.5 text-sm text-mute">
                  {new Date(ev.startsAt).toLocaleString()}
                </p>
              </div>
              {ev.myTicket ? (
                <Badge tone="signal">You&apos;re in</Badge>
              ) : (
                <div className="flex items-center gap-2">
                  {ev.ticketType === "pwyc" && (
                    <Field label="Name your price" className="w-28">
                      <Input
                        value={amounts[ev.id] ?? ""}
                        onChange={(e) =>
                          setAmounts((m) => ({ ...m, [ev.id]: e.target.value }))
                        }
                        placeholder="$"
                        type="number"
                        min="0"
                        step="0.01"
                      />
                    </Field>
                  )}
                  <Button onClick={() => void claim(ev)}>{claimLabel(ev.ticketType)}</Button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-mute">
              <Badge tone={ev.ticketType === "free" ? "neutral" : "spark"}>
                {TYPE_LABEL[ev.ticketType]}
                {ev.priceCents != null ? ` · $${(ev.priceCents / 100).toFixed(2)}` : ""}
              </Badge>
              <span className="tabular-nums">
                {ev.ticketCount} going
                {ev.capacity != null ? ` / ${ev.capacity}` : ""}
              </span>
            </div>
          </Card>
        ))}
        {events.length === 0 && (
          <EmptyState
            title="No upcoming events"
            description="Nothing on the calendar yet. Schedule one below."
          />
        )}
      </div>

      <Card as="section" padding="lg" className="mt-8">
        <h2 className="font-display text-lg text-text">Schedule an event</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <Field label="Title" className="sm:col-span-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Friday Night Set"
            />
          </Field>
          <Field label="Starts at">
            <Input
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              type="datetime-local"
            />
          </Field>
          <Field label="Ticket type">
            <Select
              value={ticketType}
              onChange={(e) => setTicketType(e.target.value as TicketType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Price ($)">
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              type="number"
              min="0"
              step="0.01"
            />
          </Field>
          <Field label="Capacity">
            <Input
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="Unlimited"
              type="number"
              min="1"
              step="1"
            />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
