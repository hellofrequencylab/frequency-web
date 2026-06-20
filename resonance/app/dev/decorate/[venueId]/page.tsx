"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authedFetch } from "@/lib/api/fetch";
import { useAuth } from "@/components/auth/useAuth";
import { useProfile } from "@/components/profile/useProfile";
import { DecorEditor } from "@/components/venue/DecorEditor";
import { AppShell } from "@/components/shell/AppShell";
import { Badge, Button, Card } from "@/components/ui";
import type { Venue } from "@/lib/dj/types";

/** Decorate a venue (build plan §13). Loads the venue snapshot for its current
 * decor and level, then hands off to the editor. */
export default function DecoratePage() {
  const params = useParams<{ venueId: string }>();
  const venueId = params.venueId;
  const router = useRouter();
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

  const loading = !ready || !loaded || status === "loading";

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate font-display text-2xl text-text">
              {venue ? `Decorate ${venue.name}` : "Decorate"}
            </h1>
            {venue && <Badge tone="neutral">Level {venue.level}</Badge>}
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/dev/lobby")}>
            Back to lobby
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-mute">Loading the venue.</p>
        ) : status === "missing" || !venue ? (
          <Card as="section" className="space-y-1">
            <h2 className="font-display text-lg text-text">Venue not found</h2>
            <p className="text-sm text-mute">
              This venue is not available. Head back to the lobby and pick another.
            </p>
          </Card>
        ) : (
          <DecorEditor venueId={venue.id} initialDecor={venue.decor} level={venue.level} />
        )}
      </div>
    </AppShell>
  );
}
