// Studio staff authorization (ADR-027): a SEPARATE axis from community roles.
// A community janitor is not automatically a business operator. Server-only.
// `team_members` lands in 20240221000000; untyped client view until types regen.

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { readViewAsTarget } from '@/lib/view-as'
import { type StaffRole, type StaffDomain, type Access, staffCan } from '@/lib/core/staff-roles'

// The role model + capability matrix live in lib/core/staff-roles.ts (client-safe);
// this module adds the DB lookup + server gates. Re-export so existing imports
// (`@/lib/staff`) keep working.
export type { StaffRole, StaffDomain, Access } from '@/lib/core/staff-roles'
export { staffCan } from '@/lib/core/staff-roles'

// Back-compat seniority ladder for the LEGACY marketing gates (marketer/admin/owner).
// The new functional roles (operations/accounting/support) aren't on this ladder —
// they're gated by capability via `staffCan` / `requireStaffCap`.
const ORDER: StaffRole[] = ['analyst', 'marketer', 'admin', 'owner']

export function atLeastStaff(role: StaffRole, min: StaffRole): boolean {
  return ORDER.indexOf(role) >= ORDER.indexOf(min)
}

export interface StaffMember {
  profileId: string
  role: StaffRole
}

/** The current viewer's staff membership, or null if they aren't staff.
 *
 *  SECURITY (view-as faithfulness): while a steward is previewing a downgraded role
 *  ("view as"), the staff axis is STRIPPED — exactly like `webRole → 'none'` in
 *  resolveCaller. Without this, an operator's real `team_members` role leaked through
 *  the admin guards (requireAdmin/requireAdminFloor call this directly), so "view as
 *  Crew" still cleared the `/admin` floor and the staff-domain page opts. A view-as
 *  cookie is only ever set on a real downgrade, so its mere presence means "preview". */
export async function getStaffMember(): Promise<StaffMember | null> {
  if (await readViewAsTarget()) return null
  const profileId = await getMyProfileId()
  if (!profileId) return null

  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('team_members')
    .select('role')
    .eq('profile_id', profileId)
    .maybeSingle()

  if (!data?.role) return null
  return { profileId, role: data.role as StaffRole }
}

/**
 * Gate for the Studio. Redirects to '/' unless the caller is staff at >= `min`.
 * Call once in the (studio) layout; returns the member on success.
 */
export async function requireStaff(min: StaffRole = 'analyst'): Promise<StaffMember> {
  const member = await getStaffMember()
  if (!member || !atLeastStaff(member.role, min)) redirect('/')
  return member
}

/**
 * Capability gate (ADR-127) — redirects unless the caller's staff role grants
 * `domain` at `level` (default 'write'). The way to gate a business surface by
 * function rather than the legacy seniority ladder.
 */
export async function requireStaffCap(domain: StaffDomain, level: Access = 'write'): Promise<StaffMember> {
  const member = await getStaffMember()
  if (!member || !staffCan(member.role, domain, level)) redirect('/')
  return member
}
