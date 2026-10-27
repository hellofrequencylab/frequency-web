'use server'

// Saves an operator's section order for a dashboard scope (Home or a domain) — the
// dashboard organizer. Cookie-backed per browser and per scope:
// read during server render (no reflow), no migration. Sanitized against the scope's
// section registry, so the cookie can never inject an unknown id.

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireAdminFloor } from '@/lib/admin/guard'
import { dashCookie, sanitizeDashOrder, type DashScope } from './dash-sections'
import { parseInput, z } from '@/lib/validation'

const orderInput = z.object({ scope: z.enum(['home', 'programs', 'community', 'growth', 'operations']), order: z.array(z.string().max(80)).max(40) })
const YEAR = 60 * 60 * 24 * 365

export async function setAdminDashOrder(scope: DashScope, order: string[]): Promise<void> {
  // The exact admin-shell floor (the dock only renders inside /admin).
  await requireAdminFloor()
  const input = parseInput(orderInput, { scope, order })
  const clean = sanitizeDashOrder(input.scope, input.order)
  ;(await cookies()).set(dashCookie(scope), clean.join(','), {
    path: '/',
    maxAge: YEAR,
    sameSite: 'lax',
  })
  revalidatePath(scope === 'home' ? '/admin' : `/admin/${scope}`)
}
