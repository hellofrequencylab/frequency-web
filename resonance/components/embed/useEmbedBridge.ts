"use client";

import { useEffect, useState } from "react";
import { setHostToken } from "@/lib/auth/token";
import type {
  HostIdentityClaims,
  HostInboundEvent,
} from "@/lib/integration/embed-contract";

/** Origins allowed to drive the embed via postMessage (comma-separated env).
 * Same-origin is always allowed; everything else must be listed. */
const ALLOWED_ORIGINS = (process.env.NEXT_PUBLIC_RESONANCE_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Decode (NOT verify) a JWT payload for rendering. The server re-verifies. */
function decodeClaims(token: string): HostIdentityClaims | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (!json.sub || !json.worldId) return null;
    return json as HostIdentityClaims;
  } catch {
    return null;
  }
}

/**
 * The host <-> embed bridge (spec §8.2). The host passes a signed JWT (via the
 * initial URL or a postMessage `user:identity`); we set it as the active token
 * and decode it for display. We announce `world:ready` to the host and accept
 * `theme` tokens. Outbound game events go back up via `sendUp`.
 *
 * Inbound messages are rejected unless they come from the same origin or a
 * configured host origin (the signed JWT is still the real trust gate server-side).
 */
export function useEmbedBridge() {
  const [claims, setClaims] = useState<HostIdentityClaims | null>(null);

  useEffect(() => {
    const originAllowed = (origin: string) =>
      origin === window.location.origin || ALLOWED_ORIGINS.includes(origin);

    const apply = (token: string) => {
      const c = decodeClaims(token);
      if (!c) return;
      setHostToken(token);
      setClaims(c);
    };

    const onMessage = (e: MessageEvent) => {
      if (!originAllowed(e.origin)) return;
      const data = e.data as HostInboundEvent;
      if (data?.type === "user:identity" && typeof data.token === "string") {
        apply(data.token);
      } else if (data?.type === "theme" && data.tokens) {
        for (const [k, v] of Object.entries(data.tokens)) {
          document.documentElement.style.setProperty(`--${k}`, v);
        }
      }
    };
    window.addEventListener("message", onMessage);

    // Token may also arrive on the URL for the initial load. Defer past a
    // microtask so the setState isn't a synchronous cascade in the effect.
    const initial = new URLSearchParams(window.location.search).get("token");
    if (initial) void Promise.resolve().then(() => apply(initial));

    // Tell the host we're ready to receive identity.
    window.parent?.postMessage({ type: "world:ready" }, "*");

    return () => window.removeEventListener("message", onMessage);
  }, []);

  const sendUp = (msg: unknown) => window.parent?.postMessage(msg, "*");

  return { claims, sendUp };
}
