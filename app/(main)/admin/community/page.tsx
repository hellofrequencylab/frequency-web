import { Users } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

// COMMUNITY, the people and their spaces as a single operator DASHBOARD (ADR-233 IA). Module-driven
// (ADR-270/294): the page composes the AdminTemplate header, then renders <PageModules>, which lays
// out the Structure & people band, the live Trust & safety queue, the Feed reach switch, the Manage
// grid (one card per working sub-page), and the Related areas strip in the operator-chosen order.
// Each block is a self-fetching, fail-safe RSC in components/widgets/community/* isolated in its own
// <Suspense>, so a slow read never blocks the shell (PAGE-FRAMEWORK §5) and staff arrange them from
// the on-page Settings → Layout panel.
//
// STAFF-GATED: requireAdmin('host', { staff: 'community' }) — the host floor OR a community staff role.
// Each linked area keeps its own (often stricter) gate. The modules render only through this gated
// route, so they never re-gate. The /admin/* group mounts its own info rail (page-chrome 'none'), so
// no rail registration is needed here.
export const dynamic = 'force-dynamic'

export default async function CommunityDashboard() {
  await requireAdmin('host', { staff: 'community' })

  return (
    <AdminTemplate
      title="Community"
      eyebrow="Domain"
      icon={Users}
      width="wide"
      description="The people and their spaces in one place: the shape of the live site and who's in it, the live trust and safety queue, then every working surface, each a click from editing."
    >
      <PageModules route="/admin/community" />
    </AdminTemplate>
  )
}
