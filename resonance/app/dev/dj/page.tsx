"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RoomShell } from "@/components/dj/RoomShell";

const VENUE_KEY = "resonance.demo.venueId";

/**
 * Single-venue dev surface (build plan §2/§3). Creates or reuses one venue in
 * localStorage. For browsing multiple rooms, see /dev/lobby.
 */
export default function DjDemoPage() {
  const [venueId, setVenueId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (active) setVenueId(localStorage.getItem(VENUE_KEY));
    })();
    return () => {
      active = false;
    };
  }, []);

  const createVenue = async () => {
    const res = await fetch("/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Open Decks" }),
    });
    const { venue } = await res.json();
    localStorage.setItem(VENUE_KEY, venue.id);
    setVenueId(venue.id);
  };

  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <p style={{ fontSize: 13 }}>
        <Link href="/dev/lobby">Browse the lobby →</Link>
      </p>
      {!venueId ? (
        <section style={{ border: "1px solid #e4e4e7", borderRadius: 8, padding: "1rem" }}>
          <p style={{ color: "#555" }}>Create a venue, then open this page in a few windows.</p>
          <button onClick={createVenue}>Create a venue</button>
        </section>
      ) : (
        <RoomShell
          venueId={venueId}
          onLeaveVenue={() => {
            localStorage.removeItem(VENUE_KEY);
            setVenueId(null);
          }}
        />
      )}
    </main>
  );
}
