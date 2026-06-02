'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NAV_AREA_DEFAULTS, ACCESS_LEVELS, type NavAccess } from '@/lib/nav-areas'

// Editing the permission grid is the most sensitive control — janitor only.
// (Admins are nearly-janitor, but not for the keys-to-the-keys.)
export async function setAreaPermission(areaKey: string, minRole: NavAccess) {
  const caller = await getCallerProfile()
  if (!caller || caller.community_role !== 'janitor') throw new Error('Unauthorized')

  if (!(areaKey in NAV_AREA_DEFAULTS)) throw new Error('Unknown area')
  if (!ACCESS_LEVELS.includes(minRole)) throw new Error('Invalid access level')

  const db = createAdminClient() as unknown as SupabaseClient
  const { error } = await db
    .from('area_permissions')
    .upsert(
      { area_key: areaKey, min_role: minRole, updated_at: new Date().toISOString(), updated_by: caller.id },
      { onConflict: 'area_key' },
    )
  if (error) throw new Error(error.message)

  // The menu is built in the authed layout — revalidate it everywhere.
  revalidatePath('/', 'layout')
}
