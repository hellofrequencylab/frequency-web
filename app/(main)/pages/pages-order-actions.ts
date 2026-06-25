'use server'

// Saves an operator's area order for the Pages workspace — the page-admin dock's
// drag-and-drop organizer. Cookie-backed per browser: read during server render (no
// reflow), no migration. Sanitized against the area registry, so the cookie can never
// inject an unknown id. Mirrors dash-order-actions.ts.

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { pagesCookie, sanitizePagesOrder, type PagesArea } from './pages-areas'

const YEAR = 60 * 60 * 24 * 365

export async function setPagesSectionsOrder(order: PagesArea[]): Promise<void> {
  // Pages management is janitor-gated at the page; the sort itself only needs staff.
  await requireAdmin('admin')
  const clean = sanitizePagesOrder(order)
  ;(await cookies()).set(pagesCookie(), clean.join(','), {
    path: '/',
    maxAge: YEAR,
    sameSite: 'lax',
  })
  revalidatePath('/pages')
}
