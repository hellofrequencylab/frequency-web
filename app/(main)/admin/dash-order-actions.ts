'use server'

// Saves the operator's admin-home section order (the page-admin dock's drag-and-
// drop organizer). Cookie-backed per browser: readable during server render (no
// reflow), no migration. Sanitized against the section registry, so the cookie
// can never inject an unknown id.

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireAdminFloor } from '@/lib/admin/guard'
import { DASH_ORDER_COOKIE, sanitizeDashOrder } from './dash-sections'

const YEAR = 60 * 60 * 24 * 365

export async function setAdminDashOrder(order: string[]): Promise<void> {
  // The exact admin-shell floor (community host+ OR staff axis OR team staff role) —
  // the dock only renders inside /admin, this keeps the gate identical.
  await requireAdminFloor()
  const clean = sanitizeDashOrder(order)
  ;(await cookies()).set(DASH_ORDER_COOKIE, clean.join(','), {
    path: '/',
    maxAge: YEAR,
    sameSite: 'lax',
  })
  revalidatePath('/admin')
}
