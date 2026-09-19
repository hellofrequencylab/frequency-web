'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NAV_AREA_DEFAULTS, ACCESS_LEVELS, type NavAccess } from '@/lib/nav-areas'
import { isJanitor } from '@/lib/core/roles'
import {
  STAFF_ROLES,
  STAFF_DOMAINS,
  ACCESS_LEVELS as STAFF_ACCESS_LEVELS,
  staffDomainDefault,
  type Access,
  type StaffDomain,
  type StaffRole,
} from '@/lib/core/staff-roles'
import { parseInput, z, uuid, requiredText } from '@/lib/validation'

const staffRole = z.enum(STAFF_ROLES as [StaffRole, ...StaffRole[]])
const navAccess = z.enum(ACCESS_LEVELS as [NavAccess, ...NavAccess[]])
const staffAccess = z.enum(STAFF_ACCESS_LEVELS as [Access, ...Access[]])
const staffDomain = z.enum(STAFF_DOMAINS as [StaffDomain, ...StaffDomain[]])

// Editing the permission grid is the most sensitive control — janitor only.
// (Admins are nearly-janitor, but not for the keys-to-the-keys.)
export async function setAreaPermission(areaKey: string, minRole: NavAccess) {
  const caller = await getCallerProfile()
  if (!caller || !isJanitor(caller.webRole)) throw new Error('Unauthorized')

  const parsed = parseInput(z.object({ areaKey: requiredText('Unknown area'), minRole: navAccess }), {
    areaKey,
    minRole,
  })
  if (!(parsed.areaKey in NAV_AREA_DEFAULTS)) throw new Error('Unknown area')

  const db = createAdminClient()
  const { error } = await db
    .from('area_permissions')
    .upsert(
      { area_key: parsed.areaKey, min_role: parsed.minRole, updated_at: new Date().toISOString(), updated_by: caller.id },
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
  if (!caller || !isJanitor(caller.webRole)) throw new Error('Unauthorized')

  const parsed = parseInput(z.object({ profileId: uuid, role: staffRole.nullable() }), {
    profileId,
    role,
  })

  const db = createAdminClient()
  if (parsed.role === null) {
    const { error } = await db.from('team_members').delete().eq('profile_id', parsed.profileId)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await db
      .from('team_members')
      .upsert({ profile_id: parsed.profileId, role: parsed.role }, { onConflict: 'profile_id' })
    if (error) throw new Error(error.message)
  }
  revalidatePath('/', 'layout')
}

/** Add a member to the team by @handle, at `role`. */
export async function addStaffMember(handle: string, role: StaffRole): Promise<{ ok: boolean; error?: string }> {
  const caller = await getCallerProfile()
  if (!caller || !isJanitor(caller.webRole)) return { ok: false, error: 'Unauthorized' }

  let parsed: { handle: string; role: StaffRole }
  try {
    parsed = parseInput(z.object({ handle: requiredText('Enter a member @handle.'), role: staffRole }), {
      handle,
      role,
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid input' }
  }

  const h = parsed.handle.trim().replace(/^@/, '')
  if (!h) return { ok: false, error: 'Enter a member @handle.' }

  const db = createAdminClient()
  const { data: prof } = await db.from('profiles').select('id').eq('handle', h).maybeSingle()
  if (!prof?.id) return { ok: false, error: `No member found for @${h}.` }

  const { error } = await db
    .from('team_members')
    .upsert({ profile_id: prof.id as string, role: parsed.role }, { onConflict: 'profile_id' })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

// ── Per-FUNCTION (capability) permission grid (P1.7, ADR-222) ─────────────────
// Owner-editable matrix at the (staff_role × capability domain) granularity. As
// sensitive as the route-level grid above — janitor only (the keys-to-the-keys).
// Setting a cell back to its CODE DEFAULT removes the override row (so the table
// stays a sparse OVERRIDE store and "no override == today" holds).
export async function setCapabilityPermission(role: StaffRole, domain: StaffDomain, access: Access) {
  const caller = await getCallerProfile()
  if (!caller || !isJanitor(caller.webRole)) throw new Error('Unauthorized')

  const parsed = parseInput(z.object({ role: staffRole, domain: staffDomain, access: staffAccess }), {
    role,
    domain,
    access,
  })

  const db = createAdminClient()

  // Back to default ⇒ delete the override (keep the store sparse + behavior-preserving).
  if (parsed.access === staffDomainDefault(parsed.role, parsed.domain)) {
    const { error } = await db
      .from('capability_permissions')
      .delete()
      .eq('role', parsed.role)
      .eq('domain', parsed.domain)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await db
      .from('capability_permissions')
      .upsert(
        { role: parsed.role, domain: parsed.domain, access: parsed.access, updated_at: new Date().toISOString(), updated_by: caller.id },
        { onConflict: 'role,domain' },
      )
    if (error) throw new Error(error.message)
  }

  // The capability gate is read in the authed layout / admin guards — revalidate.
  revalidatePath('/', 'layout')
}
