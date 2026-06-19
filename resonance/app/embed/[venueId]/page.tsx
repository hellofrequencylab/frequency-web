"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useEmbedBridge } from "@/components/embed/useEmbedBridge";
import { Room } from "@/components/dj/Room";
import { authedFetch } from "@/lib/api/fetch";

/**
 * Embeddable DJ Lounge (spec §8). Mounted in an iframe by a host (Frequency
 * first). Identity is the host's federated JWT — no separate sign-in. The same
 * Room as standalone; the host gets `zaps:awarded` / `rank:changed` back over
 * postMessage (and, server-side, over the signed webhook).
 */
export default function EmbedPage() {
  const params = useParams<{ venueId: string }>();
  const venueId = params.venueId;
  const { claims, sendUp } = useEmbedBridge();
  const [profileReady, setProfileReady] = useState(false);

  const name = claims ? (claims.displayName ?? `Member ${claims.sub.slice(0, 4)}`) : "";

  // Auto-provision a profile from the host claims so the member can DJ at once.
  useEffect(() => {
    if (!claims) return;
    let active = true;
    void (async () => {
      const res = await authedFetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      if (active) setProfileReady(res.ok);
    })();
    return () => {
      active = false;
    };
  }, [claims, name]);

  if (!claims) return <main style={wrap}>Waiting for host identity…</main>;

  return (
    <main style={wrap}>
      <Room
        venueId={venueId}
        userId={claims.sub}
        name={name}
        canDj={profileReady}
        onGameEvent={(e) => sendUp(e.payload)}
      />
    </main>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: "48rem",
  margin: "0 auto",
  padding: "1rem",
  fontFamily: "system-ui",
};
