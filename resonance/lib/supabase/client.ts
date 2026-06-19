import { createClient } from "@supabase/supabase-js";

/**
 * Browser client used ONLY for Realtime Broadcast + Presence channels (room
 * events, avatar positions, live votes). It never reads or writes tables
 * directly: all data access is server-side (see ./server.ts).
 *
 * Broadcast/Presence are not table-bound, so this needs no schema exposure and
 * no Postgres publication. That keeps realtime trivially portable across
 * projects and avoids coupling to the shared Frequency DB (ADR-006).
 */
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_RESONANCE_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_RESONANCE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_RESONANCE_SUPABASE_URL or NEXT_PUBLIC_RESONANCE_SUPABASE_ANON_KEY",
    );
  }
  return createClient(url, anonKey, {
    auth: { persistSession: true },
  });
}
