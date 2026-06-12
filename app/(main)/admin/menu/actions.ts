'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NAV_AREA_DEFAULTS } from '@/lib/nav-areas'

// The GLOBAL menu manager writes — the operator's single shared menu order +
// per-item visibility. As sensitive as the per-role grid: janitor only (the
// keys-to-the-keys), mirroring setAreaPermission. Writes go through the service
// role; the menu is built in the authed layout, so each action revalidates the
// whole layout to refresh the rail for everyone.

/** Janitor-only guard, mirroring setAreaPermission. */
async function requireJanitor() {
  const caller = await getCallerProfile()
  if (!caller || caller.community_role !== 'janitor') throw new Error('Unauthorized')
  return caller
}

/** Persist the operator's global order: upsert each known area's position. Unknown
 *  keys are skipped so the order can never inject an area that no longer exists. */
export async function setMenuOrder(order: string[]) {
  const caller = await requireJanitor()

  const now = new Date().toISOString()
  const rows = order
    .filter((key) => key in NAV_AREA_DEFAULTS)
    .map((key, position) => ({ area_key: key, position, updated_at: now, updated_by: caller.id }))
  if (rows.length === 0) return

  const db = createAdminClient() as unknown as SupabaseClient
  // Upsert positions; `hidden` keeps its existing value (column omitted from the
  // payload, so an existing row's flag is preserved and a new row defaults to false).
  const { error } = await db.from('menu_config').upsert(rows, { onConflict: 'area_key' })
  if (error) throw new Error(error.message)

  revalidatePath('/', 'layout')
}

/** Persist a single item's global visibility. */
export async function setMenuVisibility(areaKey: string, hidden: boolean) {
  const caller = await requireJanitor()
  if (!(areaKey in NAV_AREA_DEFAULTS)) throw new Error('Unknown area')

  const db = createAdminClient() as unknown as SupabaseClient
  const { error } = await db
    .from('menu_config')
    .upsert(
      { area_key: areaKey, hidden, updated_at: new Date().toISOString(), updated_by: caller.id },
      { onConflict: 'area_key' },
    )
  if (error) throw new Error(error.message)

  revalidatePath('/', 'layout')
}

/** Clear every override — back to the code defaults (NAV_AREAS order, nothing hidden). */
export async function resetMenuConfig() {
  await requireJanitor()

  const db = createAdminClient() as unknown as SupabaseClient
  // Delete all rows. The `.neq` is a no-op match-all that satisfies the client's
  // "must have a filter" guard while clearing the whole override store.
  const { error } = await db.from('menu_config').delete().neq('area_key', '')
  if (error) throw new Error(error.message)

  revalidatePath('/', 'layout')
}
