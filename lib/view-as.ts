// Janitor "view as any role" — the shared override helper.
//
// A janitor can preview the app as a lower role. The chosen role lives in an
// httpOnly cookie (set only via the server action, after a real-role check) and
// is resolved into an *effective* community role here. Both role read-paths apply
// it — the (main) layout (nav gating) and lib/auth.ts `resolveCaller` (capability
// resolver + server enforcement) — so the preview is consistent and faithful.
//
// SECURITY: the override applies ONLY when the caller's REAL role is janitor, and
// janitor is the top of the ladder, so "view as" is always a downgrade — it can
// never escalate privilege, even if a non-janitor forges the cookie.

import { cookies } from 'next/headers'
import { ROLE_HIERARCHY, type CommunityRole } from '@/lib/core/roles'

export const VIEW_AS_COOKIE = 'freq-view-as'

function isCommunityRole(v: string | undefined | null): v is CommunityRole {
  return !!v && (ROLE_HIERARCHY as readonly string[]).includes(v)
}

/** Raw role requested by the view-as cookie (not yet gated on the real role). */
export async function readViewAsCookie(): Promise<CommunityRole | null> {
  const value = (await cookies()).get(VIEW_AS_COOKIE)?.value
  return isCommunityRole(value) ? value : null
}

/**
 * The effective community role for UI + authorization, given the caller's REAL
 * role. Only a real janitor may impersonate; for everyone else the real role is
 * returned unchanged.
 */
export async function applyViewAs(realRole: CommunityRole): Promise<CommunityRole> {
  if (realRole !== 'janitor') return realRole
  return (await readViewAsCookie()) ?? realRole
}
