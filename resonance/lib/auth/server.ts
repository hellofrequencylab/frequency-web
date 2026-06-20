import { createClient } from "@supabase/supabase-js";
import { verifyHostJwt } from "./host-jwt";

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

/** Verify a standalone Supabase session token, returning the user id or null. */
async function verifySupabaseToken(token: string): Promise<string | null> {
  const url = process.env.RESONANCE_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_RESONANCE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Resolve the caller's verified user id from the `Authorization: Bearer <jwt>`
 * header. Accepts EITHER a standalone Supabase session token OR a host-issued
 * federated JWT (embedded mode). Route handlers trust THIS, never a
 * client-supplied user id (retires ADR-014's stub).
 */
export async function getAuthedUserId(req: Request): Promise<string | null> {
  const token = bearer(req);
  if (!token) return null;

  const supabaseUser = await verifySupabaseToken(token);
  if (supabaseUser) return supabaseUser;

  const hostClaims = await verifyHostJwt(token);
  return hostClaims?.sub ?? null;
}
