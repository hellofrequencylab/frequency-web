import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Singleton browser client (anon key). One instance holds the session, so auth
 * (anonymous sign-in) and Realtime (Broadcast + Presence) share the same
 * identity. It never reads/writes tables — all data access is server-side (see
 * ./server.ts). Broadcast/Presence are not table-bound, so this needs no schema
 * exposure and stays portable across projects (ADR-006).
 */
let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_RESONANCE_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_RESONANCE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_RESONANCE_SUPABASE_URL or NEXT_PUBLIC_RESONANCE_SUPABASE_ANON_KEY",
    );
  }
  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
