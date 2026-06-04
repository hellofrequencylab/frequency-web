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

/** A view-as target is any community role, or 'visitor' (the logged-out preview). */
export type ViewAsTarget = CommunityRole | 'visitor'

function isCommunityRole(v: string | undefined | null): v is CommunityRole {
  return !!v && (ROLE_HIERARCHY as readonly string[]).includes(v)
}

function isViewAsTarget(v: string | undefined | null): v is ViewAsTarget {
  return v === 'visitor' || isCommunityRole(v)
}

/** Raw target requested by the view-as cookie (not yet gated on the real role). */
export async function readViewAsTarget(): Promise<ViewAsTarget | null> {
  const value = (await cookies()).get(VIEW_AS_COOKIE)?.value
  return isViewAsTarget(value) ? value : null
}

/**
 * The effective community role for UI + authorization, given the caller's REAL
 * role. Only a real janitor may impersonate; for everyone else the real role is
 * returned unchanged. The 'visitor' preview resolves to the lowest authenticated
 * role ('member') for SERVER capability resolution — it strips every elevated
 * power and can never escalate; the visitor-only NAV gating is driven separately
 * by `viewingAsVisitor`.
 */
export async function applyViewAs(realRole: CommunityRole): Promise<CommunityRole> {
  if (realRole !== 'janitor') return realRole
  const target = await readViewAsTarget()
  if (!target) return realRole
  return target === 'visitor' ? 'member' : target
}

/** Is a real janitor previewing the logged-out visitor experience? Drives the
 *  visitor NAV gating (everything above visitor access mutes) + the chrome. */
export async function viewingAsVisitor(realRole: CommunityRole): Promise<boolean> {
  if (realRole !== 'janitor') return false
  return (await readViewAsTarget()) === 'visitor'
}
