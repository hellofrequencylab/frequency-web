"use client";

import { useEffect, useState } from "react";
import { setHostToken } from "@/lib/auth/token";
import type {
  HostIdentityClaims,
  HostInboundEvent,
} from "@/lib/integration/embed-contract";

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
 */
export function useEmbedBridge() {
  const [claims, setClaims] = useState<HostIdentityClaims | null>(null);

  useEffect(() => {
    const apply = (token: string) => {
      const c = decodeClaims(token);
      if (!c) return;
      setHostToken(token);
      setClaims(c);
    };

    // NOTE: accepts messages from any origin for the MVP. In production, validate
    // e.origin against the configured host origin(s).
    const onMessage = (e: MessageEvent) => {
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
