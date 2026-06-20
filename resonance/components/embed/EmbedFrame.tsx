"use client";

import { useEffect, useState } from "react";
import { Room } from "@/components/dj/Room";
import { authedFetch } from "@/lib/api/fetch";
import { useEmbedBridge } from "@/components/embed/useEmbedBridge";
import { isAllowedOrigin } from "@/lib/embed/origins";
import { ensureSession } from "@/lib/auth/client";

type Identity = {
  userId: string;
  name: string;
  /** True once a backing profile exists, so the member may DJ. */
  canDj: boolean;
  /** "host" = federated host JWT; "anonymous" = standalone fallback. */
  source: "host" | "anonymous";
};

/**
 * The embed's client surface. Resolves identity one of two ways and renders the
 * SAME `Room` as standalone:
 *
 *  1. Federated (embedded): the host passes a signed JWT via `?token=` or a
 *     postMessage `user:identity`. `useEmbedBridge` only accepts that message
 *     from an allowed origin (`lib/embed/origins`), decodes the claims for
 *     display, and arms `authedFetch` with the token. The server RE-VERIFIES the
 *     signature (`lib/auth/host-identity` / `host-jwt`) on every API call — the
 *     decoded claims here are display-only.
 *
 *  2. Anonymous (standalone): with NO host token after a short grace window, we
 *     fall back to an anonymous Supabase session, exactly like the rest of the
 *     app. This keeps the embed working with NO env configured.
 *
 * Either way `Room` receives a `userId` + `name` and never learns which issued
 * the identity.
 */
export function EmbedFrame({ venueId }: { venueId: string }) {
  const { claims, sendUp } = useEmbedBridge();
  const [identity, setIdentity] = useState<Identity | null>(null);

  // (1) Host identity arrived over the bridge. Provision a profile from claims.
  // Defer the first setState past a microtask so it isn't a synchronous cascade
  // inside the effect (mirrors `useEmbedBridge`'s URL-token handling).
  useEffect(() => {
    if (!claims) return;
    const name = claims.displayName ?? `Member ${claims.sub.slice(0, 4)}`;

    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setIdentity({ userId: claims.sub, name, canDj: false, source: "host" });
      const res = await authedFetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      if (active) {
        setIdentity((prev) =>
          prev && prev.source === "host" ? { ...prev, canDj: res.ok } : prev,
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [claims]);

  // (2) Standalone fallback: if no host token shows up shortly, sign in
  // anonymously so a visitor can still drop into the room with no host present.
  useEffect(() => {
    if (claims || identity) return;
    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        // A host token may still be in flight; re-check before falling back.
        if (!active || claims) return;
        const userId = await ensureSession();
        if (!active || !userId || claims) return;
        const name = `Guest ${userId.slice(0, 4)}`;
        const res = await authedFetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: name }),
        });
        if (active) {
          setIdentity({ userId, name, canDj: res.ok, source: "anonymous" });
        }
      })();
    }, HOST_TOKEN_GRACE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [claims, identity]);

  if (!identity) {
    return <main style={wrap}>Loading the room…</main>;
  }

  return (
    <main style={wrap}>
      <Room
        venueId={venueId}
        userId={identity.userId}
        name={identity.name}
        canDj={identity.canDj}
        onGameEvent={(e) => sendUp(e.payload)}
      />
    </main>
  );
}

/**
 * How long to wait for a host `user:identity` (or `?token=`) before assuming
 * standalone and signing in anonymously. The bridge applies a URL token on a
 * microtask and posts `world:ready` immediately, so a real host answers well
 * inside this window; this only delays the no-host case.
 */
const HOST_TOKEN_GRACE_MS = 600;

// Re-exported so callers/tests can reason about the bridge's origin policy.
export { isAllowedOrigin };

const wrap: React.CSSProperties = {
  maxWidth: "48rem",
  margin: "0 auto",
  padding: "1rem",
  fontFamily: "system-ui",
};
