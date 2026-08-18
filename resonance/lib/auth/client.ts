"use client";

import { standaloneAnonymousAuthEnabled } from "@/lib/config";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * Standalone identity, anonymous-first (spec §3.2: low-friction entry, deep
 * ceiling). A visitor gets a real Supabase Auth session with no signup wall;
 * later it can be upgraded to email/OAuth and linked. When embedded, this is
 * replaced by the host's federated JWT (Section 5) — same downstream contract.
 *
 * ⚠️ ANONYMOUS SIGN-IN IS A CAPABILITY OF THE PROJECT, NOT OF THIS CODE. It is
 * OFF on the shared Frequency project and stays off (ADR-019 here, ADR-1054 in
 * Frequency's docs/DECISIONS.md). So this never fires the call blind: it asks
 * `standaloneAnonymousAuthEnabled()` first and returns null when the capability
 * was not granted. Firing anyway would spend a round trip to learn something the
 * deployment already knows, and — worse — it made "the project forbids this"
 * indistinguishable from "auth is down", which is how three surfaces ended up
 * telling a reader to go flip a setting on the live platform's project.
 */
export async function ensureSession(): Promise<string | null> {
  const sb = getBrowserSupabase();
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session) return session.user.id;

  if (!standaloneAnonymousAuthEnabled()) return null;

  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    console.warn("anonymous sign-in failed:", error.message);
    return null;
  }
  return data.user?.id ?? null;
}

/**
 * What a surface tells someone when `ensureSession()` came back empty. One
 * string, three call sites, so the explanation cannot drift between them.
 *
 * It must NOT send the reader off to change an Auth setting on the project,
 * which is what all three surfaces did before ADR-019: on the shared project
 * that is an instruction to widen the live platform's auth surface.
 */
export const NO_STANDALONE_SESSION_MESSAGE =
  "Guest sessions are off for this deployment. Open the room from its Frequency host, or run Resonance against its own Supabase project.";

/** Current access token (JWT) for authorizing API calls, or null if signed out. */
export async function getAccessToken(): Promise<string | null> {
  const sb = getBrowserSupabase();
  const {
    data: { session },
  } = await sb.auth.getSession();
  return session?.access_token ?? null;
}
