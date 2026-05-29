// Studio staff authorization (ADR-027): a SEPARATE axis from community roles.
// A community janitor is not automatically a business operator. Server-only.
// `team_members` lands in 20240221000000; untyped client view until types regen.

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'

export type StaffRole = 'analyst' | 'marketer' | 'admin' | 'owner'

const ORDER: StaffRole[] = ['analyst', 'marketer', 'admin', 'owner']

export function atLeastStaff(role: StaffRole, min: StaffRole): boolean {
  return ORDER.indexOf(role) >= ORDER.indexOf(min)
}

export interface StaffMember {
  profileId: string
  role: StaffRole
}

/** The current viewer's staff membership, or null if they aren't staff. */
export async function getStaffMember(): Promise<StaffMember | null> {
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
