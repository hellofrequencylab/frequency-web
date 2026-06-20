"use client";

import { useParams } from "next/navigation";
import { EmbedFrame } from "@/components/embed/EmbedFrame";

/**
 * Embeddable DJ Lounge (spec §8). Mounted in an iframe by a host (Frequency
 * first). Identity is federated: the host signs an RS256 JWT we verify
 * (`lib/auth/host-identity`), passed via `?token=` or a postMessage handshake
 * that is origin-checked against `NEXT_PUBLIC_RESONANCE_ALLOWED_ORIGINS`
 * (`lib/embed/origins`). With NO host token and NO env configured, the embed
 * falls back to a standalone anonymous session, so it still works on its own.
 *
 * All the client work (bridge + identity resolution) lives in `EmbedFrame`; this
 * page only resolves the route param and mounts it. See docs/EMBED.md.
 */
export default function EmbedPage() {
  const params = useParams<{ venueId: string }>();
  return <EmbedFrame venueId={params.venueId} />;
}
