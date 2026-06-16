import { AdminSection } from '@/components/templates'
import { groupLinks } from '@/app/(main)/admin/sections'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'
import { AreaTiles } from './area-tiles'

// The Rewards & economy tab of the Programs workspace: the launchpad into the economy
// surfaces (Gamification, the gem Store, Retroactive rewards, Crew tasks). The leaf
// editors keep their own (often stricter, admin) gates; this only lists what the viewer
// can reach (groupLinks filters by role + staff axis).
export async function RewardsTab({
  role,
  webRole,
  staffRole,
}: {
  role: CommunityRole
  webRole: WebRole
  staffRole: StaffRole | null
}) {
  const links = groupLinks('rewards', role, webRole, staffRole)
  return (
    <AdminSection
      title="Rewards & economy"
      description="Tune the economy and the awards members earn. Each surface keeps its own gate."
    >
      <AreaTiles links={links} />
    </AdminSection>
  )
}
