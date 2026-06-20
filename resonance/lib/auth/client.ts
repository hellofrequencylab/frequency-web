"use client";

import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * Standalone identity, anonymous-first (spec §3.2: low-friction entry, deep
 * ceiling). A visitor gets a real Supabase Auth session with no signup wall;
 * later it can be upgraded to email/OAuth and linked. When embedded, this is
 * replaced by the host's federated JWT (Section 5) — same downstream contract.
 *
 * Requires "Anonymous sign-ins" enabled in the project's Auth settings.
 */
export async function ensureSession(): Promise<string | null> {
  const sb = getBrowserSupabase();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session) return session.user.id;

  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    console.warn("anonymous sign-in failed:", error.message);
    return null;
  }
  return data.user?.id ?? null;
}

/** Current access token (JWT) for authorizing API calls, or null if signed out. */
export async function getAccessToken(): Promise<string | null> {
  const sb = getBrowserSupabase();
  const {
    data: { session },
  } = await sb.auth.getSession();
  return session?.access_token ?? null;
}
