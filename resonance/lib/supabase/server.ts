import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { APP } from "@/lib/config";

/**
 * Trusted server-side client, scoped to this app's isolated schema.
 *
 * Uses the service-role key, so it must NEVER be imported into a Client
 * Component or shipped to the browser. ALL privileged data access goes through
 * here. RLS is the backstop, not the gate: the data layer is server-only by
 * design, which is also what keeps the app from depending on the shared
 * project's exposed-schema config (ADR-006).
 *
 * Typed generics get added once we generate types from the schema.
 */
export function createServerClient(): SupabaseClient {
  const url = process.env.RESONANCE_SUPABASE_URL;
  const serviceKey = process.env.RESONANCE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing RESONANCE_SUPABASE_URL or RESONANCE_SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, serviceKey, {
    db: { schema: APP.dbSchema },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
