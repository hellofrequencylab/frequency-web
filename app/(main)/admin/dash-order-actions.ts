'use server'

// Saves an operator's section order for a dashboard scope (Home or a domain) — the
// page-admin dock's drag-and-drop organizer. Cookie-backed per browser and per scope:
// read during server render (no reflow), no migration. Sanitized against the scope's
// section registry, so the cookie can never inject an unknown id.

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireAdminFloor } from '@/lib/admin/guard'
import { DASH_SCOPES, dashCookie, sanitizeDashOrder, type DashScope } from './dash-sections'

const YEAR = 60 * 60 * 24 * 365

export async function setAdminDashOrder(scope: DashScope, order: string[]): Promise<void> {
  // The exact admin-shell floor (the dock only renders inside /admin).
  await requireAdminFloor()
  if (!(scope in DASH_SCOPES)) return
  const clean = sanitizeDashOrder(scope, order)
  ;(await cookies()).set(dashCookie(scope), clean.join(','), {
    path: '/',
    maxAge: YEAR,
    sameSite: 'lax',
  })
  revalidatePath(scope === 'home' ? '/admin' : `/admin/${scope}`)
}
