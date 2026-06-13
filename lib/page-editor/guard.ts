import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaffMember, staffCan } from '@/lib/staff'
import { isStaff, isJanitor, asWebRole } from '@/lib/core/roles'
import { canUseSurface } from '@/lib/core/viewer-hats'

// Marketing-page management is gated to the `janitor` community role (the top
// community admin), separate from the Studio staff system. One place so the
// directory, the editor route, and the publish/draft actions stay in sync.

export async function getJanitor(): Promise<{ profileId: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Page management is the Executive-Admin (janitor) web_role now (ADR-208).
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, web_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const row = data as { id: string; web_role?: string } | null
  if (!row || !isJanitor(asWebRole(row.web_role))) return null
  return { profileId: row.id }
}

export async function requireJanitor(): Promise<{ profileId: string }> {
  const janitor = await getJanitor()
  if (!janitor) throw new Error('Forbidden: janitor role required')
  return janitor
}

// Growth Studio (now the home for the disbanded Marketing suite, IA §10.2) is
// reachable by community admin/janitor OR a staff role with the 'marketing'
// capability — the same gate the marketing workspace carried, so no one loses
// access when the standalone Marketing nav item retires.
export async function canAccessGrowthStudio(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('web_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (isStaff(asWebRole((data as { web_role?: string } | null)?.web_role))) return true

  const staff = await getStaffMember().catch(() => null)
  if (staff && staffCan(staff.role, 'marketing', 'read')) return true

  // Partner personas (P3): Business / Organization unlock Growth Studio via the matrix.
  return canUseSurface('growthStudio')
}
