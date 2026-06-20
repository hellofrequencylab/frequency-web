import type { RealtimeTransport } from "./transport";
import { createSupabaseTransport } from "./supabase-transport";
import { createPartyKitTransport } from "./partykit-transport";

/**
 * Realtime driver factory (ADR-005 seam).
 *
 * One interface (`RealtimeTransport`), swappable adapters. This picks the
 * adapter at runtime from an env var so moving to dedicated realtime infra
 * (PartyKit / Liveblocks / Colyseus) is a CONFIG change, not a rewrite.
 *
 * Default is Supabase Realtime, which is the working transport today.
 *
 * Note: existing call sites (e.g. components/dj/useVenue.ts) import
 * `createSupabaseTransport` directly. Migrating them to `createTransport()` is
 * the one-line swap this seam enables. Those call sites are intentionally NOT
 * migrated here; this factory exists so the swap is low-risk later.
 *
 * @see docs/REALTIME.md
 */

/** Supported realtime drivers. `supabase` is the default and only wired one. */
export type RealtimeDriver = "supabase" | "partykit";

/**
 * Select the realtime transport from `NEXT_PUBLIC_RESONANCE_REALTIME_DRIVER`.
 *
 * - `"supabase"` (or unset / unknown): the production Supabase adapter.
 * - `"partykit"`: a dependency-free skeleton adapter (not yet wired to a
 *   server). It is safe to select but does nothing useful until the real
 *   PartyKit/Liveblocks wiring lands. See partykit-transport.ts.
 */
export function createTransport(): RealtimeTransport {
  const driver = process.env
    .NEXT_PUBLIC_RESONANCE_REALTIME_DRIVER as RealtimeDriver | undefined;

  switch (driver) {
    case "partykit":
      return createPartyKitTransport();
    case "supabase":
    default:
      return createSupabaseTransport();
  }
}
