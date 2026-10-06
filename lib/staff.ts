// Studio staff authorization (ADR-027): a SEPARATE axis from community roles.
// A community janitor is not automatically a business operator. Server-only.
// `team_members` lands in 20240221000000; untyped client view until types regen.

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { readViewAsTarget } from '@/lib/view-as'
import { type StaffRole, type StaffDomain, type Access, staffCan } from '@/lib/core/staff-roles'
import { getCapabilityOverrides } from '@/lib/permissions'

// The role model + capability matrix live in lib/core/staff-roles.ts (client-safe);
// this module adds the DB lookup + server gates. Re-export so existing imports
// (`@/lib/staff`) keep working.
export type { StaffRole, StaffDomain, Access } from '@/lib/core/staff-roles'
export { staffCan } from '@/lib/core/staff-roles'

// Back-compat seniority ladder for the LEGACY marketing gates (marketer/admin/owner).
// The new functional roles (operations/accounting/support) aren't on this ladder —
// they're gated by capability via `staffCan` / `requireStaffCap`.
const ORDER: StaffRole[] = ['analyst', 'marketer', 'admin', 'owner']

function atLeastStaff(role: StaffRole, min: StaffRole): boolean {
  return ORDER.indexOf(role) >= ORDER.indexOf(min)
}

interface StaffMember {
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
 *  cookie is only ever set on a real downgrade, so its mere presence means "preview".
 *
 *  REQUEST-CACHED (React `cache`, ADR-1243): the (main) layout asks for it directly, again through
 *  getViewerHats, and a third time through requireAdminFloor on an operator page, and each was its
 *  own `team_members` round trip. Per-request only: it is keyed on the viewer and must never cross
 *  requests. */
export const getStaffMember = cache(async (): Promise<StaffMember | null> => {
  if (await readViewAsTarget()) return null
  const profileId = await getMyProfileId()
  if (!profileId) return null

  const db = createAdminClient()
  const { data } = await db
    .from('team_members')
    .select('role')
    .eq('profile_id', profileId)
    .maybeSingle()

  if (!data?.role) return null
  return { profileId, role: data.role as StaffRole }
})

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
 * Does the CURRENT viewer's staff role grant `domain` at `level` (default 'write')?
 * Pairs getStaffMember with staffCan and the owner-editable capability grid
 * (ADR-222), so a grid denial or grant is honoured here exactly as requireAdmin
 * honours it. The grid read is request-cached and fails open to {} (code defaults),
 * so an empty table resolves exactly as `CAPS`. Not staff ⇒ false. Use this instead
 * of `staffCan(staff.role, …)` with no overrides, which reads only the code defaults.
 */
export async function staffCanNow(domain: StaffDomain, level: Access = 'write'): Promise<boolean> {
  const member = await getStaffMember()
  if (!member) return false
  const overrides = await getCapabilityOverrides().catch(() => undefined)
  return staffCan(member.role, domain, level, overrides)
}

/**
 * Capability gate (ADR-127) — redirects unless the caller's staff role grants
 * `domain` at `level` (default 'write'). The way to gate a business surface by
 * function rather than the legacy seniority ladder. Layers the capability grid
 * (ADR-222) on top of the code defaults, like requireAdmin does.
 */
export async function requireStaffCap(domain: StaffDomain, level: Access = 'write'): Promise<StaffMember> {
  const member = await getStaffMember()
  if (!member) redirect('/')
  const overrides = await getCapabilityOverrides().catch(() => undefined)
  if (!staffCan(member.role, domain, level, overrides)) redirect('/')
  return member
}
