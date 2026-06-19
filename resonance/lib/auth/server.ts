import { createClient } from "@supabase/supabase-js";

/**
 * Resolve the caller's verified user id from the `Authorization: Bearer <jwt>`
 * header. The JWT is validated by Supabase (`auth.getUser`), so route handlers
 * trust THIS, never a client-supplied user id (retires ADR-014's stub).
 *
 * In embedded mode the same seam verifies a host-issued JWT instead (Section 5).
 */
export async function getAuthedUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

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
