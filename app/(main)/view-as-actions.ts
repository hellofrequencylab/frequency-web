'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getRealCallerRole } from '@/lib/auth'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { ROLE_HIERARCHY, type CommunityRole } from '@/lib/core/roles'

// Janitor-only "view as any role". Sets (or clears) the view-as cookie. The
// effective-role resolution in lib/view-as.ts only honours the cookie when the
// caller's REAL role is janitor, but we re-check here too (defence in depth) so a
// non-janitor can never even write the cookie.
export async function setViewAsRole(role: CommunityRole | 'visitor' | null): Promise<void> {
  const realRole = await getRealCallerRole()
  if (realRole !== 'janitor') return

  const jar = await cookies()
  // Clearing (back to self), or a no-op "view as janitor", removes the cookie.
  // 'visitor' is a valid target; any other non-ladder value clears.
  if (!role || role === 'janitor' || (role !== 'visitor' && !ROLE_HIERARCHY.includes(role))) {
    jar.delete(VIEW_AS_COOKIE)
  } else {
    jar.set(VIEW_AS_COOKIE, role, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      // Auto-expires so a janitor is never silently stuck impersonating.
      maxAge: 60 * 60 * 8,
    })
  }

  // Role drives the whole authenticated shell + capabilities, so refresh it all.
  revalidatePath('/', 'layout')
}
