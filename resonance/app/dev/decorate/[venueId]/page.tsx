"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { authedFetch } from "@/lib/api/fetch";
import { useAuth } from "@/components/auth/useAuth";
import { useProfile } from "@/components/profile/useProfile";
import { DecorEditor } from "@/components/venue/DecorEditor";
import type { Venue } from "@/lib/dj/types";

/** Decorate a venue (build plan §13). Loads the venue snapshot for its current
 * decor and level, then hands off to the editor. */
export default function DecoratePage() {
  const params = useParams<{ venueId: string }>();
  const venueId = params.venueId;
  const { ready } = useAuth();
  const { loaded } = useProfile(ready);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    if (!ready) return;
    let active = true;
    void (async () => {
      const res = await authedFetch(`/api/venues/${venueId}`);
      if (!active) return;
      if (!res.ok) {
        setStatus("missing");
        return;
      }
      const j = (await res.json()) as { venue: Venue };
      setVenue(j.venue);
      setStatus("ready");
    })();
    return () => {
      active = false;
    };
  }, [ready, venueId]);

  return (
    <main style={{ maxWidth: "52rem", margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <p>
        <Link href="/dev/lobby">← lobby</Link>
      </p>

      {!ready || !loaded || status === "loading" ? (
        <p style={{ color: "#888" }}>Loading...</p>
      ) : status === "missing" || !venue ? (
        <p style={{ color: "#888" }}>Venue not found.</p>
      ) : (
        <>
          <h1 style={{ marginBottom: "0.25rem" }}>Decorate {venue.name}</h1>
          <p style={{ color: "#888", marginTop: 0 }}>Level {venue.level}</p>
          <DecorEditor venueId={venue.id} initialDecor={venue.decor} level={venue.level} />
        </>
      )}
    </main>
  );
}
