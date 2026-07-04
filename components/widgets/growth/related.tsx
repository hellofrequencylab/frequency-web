import { RelatedAreas } from '@/components/admin/related-areas'
import { getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'

// Growth layout module (LP7): the "Related areas" cross-link strip. Self-fetching RSC that reads the
// viewer's own roles (community, staff web_role, operations staff role) to filter the neighboring
// workspaces they can enter. This is a role READ, not a gate: the page already gated entry, so a
// missing profile just hides the strip. Fail-safe: any read error renders nothing.

interface ViewerRoles {
  role: CommunityRole
  webRole: WebRole
  staffRole: StaffRole | null
}

async function loadRoles(): Promise<ViewerRoles | null> {
  try {
    const [profile, staff] = await Promise.all([
      getCallerProfile(),
      getStaffMember().catch(() => null),
    ])
    if (!profile) return null
    return { role: profile.community_role, webRole: profile.webRole, staffRole: staff?.role ?? null }
  } catch {
    return null
  }
}

export async function GrowthRelated() {
  const roles = await loadRoles()
  if (!roles) return null

  return (
    <RelatedAreas
      current="growth"
      role={roles.role}
      webRole={roles.webRole}
      staffRole={roles.staffRole}
    />
  )
}
