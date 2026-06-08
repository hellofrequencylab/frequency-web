'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getRealCallerRole } from '@/lib/auth'
import { VIEW_AS_COOKIE, canViewAs } from '@/lib/view-as'
import { ROLE_HIERARCHY, roleRank, type CommunityRole } from '@/lib/core/roles'

// "View as a role under you" — Host and above. Sets (or clears) the view-as cookie.
// The effective-role resolution in lib/view-as.ts only honours a target ranked BELOW
// the caller's real role; we re-check here too (defence in depth) so the cookie can
// only ever hold a valid downgrade.
export async function setViewAsRole(role: CommunityRole | 'visitor' | null): Promise<void> {
  const realRole = await getRealCallerRole()
  if (!realRole || !canViewAs(realRole)) return

  const jar = await cookies()
  // A valid target is 'visitor' (always a downgrade for a steward) or a ladder role
  // ranked STRICTLY below the caller. Anything else — incl. self or a higher role —
  // clears the override (back to your own view).
  const isValidTarget =
    role === 'visitor' ||
    (!!role && ROLE_HIERARCHY.includes(role) && roleRank(role) < roleRank(realRole))
  if (!isValidTarget) {
    jar.delete(VIEW_AS_COOKIE)
  } else {
    jar.set(VIEW_AS_COOKIE, role as string, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      // Auto-expires so a steward is never silently stuck previewing.
      maxAge: 60 * 60 * 8,
    })
  }

  // Role drives the whole authenticated shell + capabilities, so refresh it all.
  revalidatePath('/', 'layout')
}
