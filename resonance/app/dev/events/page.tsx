"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/api/fetch";
import type { EventSummary, TicketType } from "@/lib/events/types";

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
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Events</h1>
      <p style={{ fontSize: 13 }}>
        <Link href="/">Home</Link> · <Link href="/dev/lobby">Lobby</Link>
      </p>

      <div style={{ display: "grid", gap: "0.75rem", margin: "1rem 0" }}>
        {events.map((ev) => (
          <div
            key={ev.id}
            style={{
              border: "1px solid #e4e4e7",
              borderRadius: 8,
              padding: "0.75rem 1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>
                <b>{ev.title}</b>{" "}
                <span style={{ color: "#888", fontSize: 12 }}>
                  · {new Date(ev.startsAt).toLocaleString()}
                </span>
              </span>
              {ev.myTicket ? (
                <span style={{ fontSize: 13, color: "#16a34a" }}>You&apos;re in</span>
              ) : (
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  {ev.ticketType === "pwyc" && (
                    <input
                      value={amounts[ev.id] ?? ""}
                      onChange={(e) =>
                        setAmounts((m) => ({ ...m, [ev.id]: e.target.value }))
                      }
                      placeholder="$"
                      type="number"
                      min="0"
                      step="0.01"
                      style={{ width: "5rem", padding: "0.3rem" }}
                    />
                  )}
                  <button onClick={() => void claim(ev)}>{claimLabel(ev.ticketType)}</button>
                </div>
              )}
            </div>
            <div style={{ color: "#888", fontSize: 12, marginTop: "0.35rem" }}>
              {TYPE_LABEL[ev.ticketType]}
              {ev.priceCents != null ? ` · $${(ev.priceCents / 100).toFixed(2)}` : ""}
              {" · "}
              {ev.ticketCount} going
              {ev.capacity != null ? ` / ${ev.capacity}` : ""}
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <p style={{ color: "#888" }}>No upcoming events. Create one below.</p>
        )}
      </div>

      <section style={{ border: "1px solid #e4e4e7", borderRadius: 8, padding: "1rem" }}>
        <h3>Schedule an event</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="title (e.g. Friday Night Set)"
            style={{ flex: 2, minWidth: "12rem", padding: "0.4rem" }}
          />
          <input
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            type="datetime-local"
            style={{ padding: "0.4rem" }}
          />
          <select
            value={ticketType}
            onChange={(e) => setTicketType(e.target.value as TicketType)}
            style={{ padding: "0.4rem" }}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="price ($)"
            type="number"
            min="0"
            step="0.01"
            style={{ width: "7rem", padding: "0.4rem" }}
          />
          <input
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="capacity"
            type="number"
            min="1"
            step="1"
            style={{ width: "7rem", padding: "0.4rem" }}
          />
          <button type="submit">Create</button>
        </form>
      </section>
    </main>
  );
}
