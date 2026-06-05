'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NAV_AREA_DEFAULTS, ACCESS_LEVELS, type NavAccess } from '@/lib/nav-areas'
import { isStaffRole, type StaffRole } from '@/lib/core/staff-roles'

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

// ── Staff / operations roles (ADR-127, team_members axis) ─────────────────────
// Assigning the business/operations roles — janitor only (the keys-to-the-keys).

/** Set or clear (role=null) a member's staff role. */
export async function setStaffRole(profileId: string, role: StaffRole | null) {
  const caller = await getCallerProfile()
  if (!caller || caller.community_role !== 'janitor') throw new Error('Unauthorized')

  const db = createAdminClient() as unknown as SupabaseClient
  if (role === null) {
    const { error } = await db.from('team_members').delete().eq('profile_id', profileId)
    if (error) throw new Error(error.message)
  } else {
    if (!isStaffRole(role)) throw new Error('Invalid staff role')
    const { error } = await db
      .from('team_members')
      .upsert({ profile_id: profileId, role }, { onConflict: 'profile_id' })
    if (error) throw new Error(error.message)
  }
  revalidatePath('/', 'layout')
}

/** Add a member to the team by @handle, at `role`. */
export async function addStaffMember(handle: string, role: StaffRole): Promise<{ ok: boolean; error?: string }> {
  const caller = await getCallerProfile()
  if (!caller || caller.community_role !== 'janitor') return { ok: false, error: 'Unauthorized' }
  if (!isStaffRole(role)) return { ok: false, error: 'Invalid staff role' }

  const h = handle.trim().replace(/^@/, '')
  if (!h) return { ok: false, error: 'Enter a member @handle.' }

  const db = createAdminClient() as unknown as SupabaseClient
  const { data: prof } = await db.from('profiles').select('id').eq('handle', h).maybeSingle()
  if (!prof?.id) return { ok: false, error: `No member found for @${h}.` }

  const { error } = await db
    .from('team_members')
    .upsert({ profile_id: prof.id as string, role }, { onConflict: 'profile_id' })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}
