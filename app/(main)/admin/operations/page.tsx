import { SlidersHorizontal } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

// OPERATIONS, "the platform machine" as a single operator DASHBOARD (ADR-233 IA). Module-driven
// (ADR-270/294): the page composes the AdminTemplate header, then renders <PageModules>, which lays
// out the AI & assistant KPIs, the platform/system-health stats, the Manage grid (one card per working
// sub-page), and the Related areas strip in the operator-chosen order. Each block is a self-fetching,
// fail-safe RSC in components/widgets/operations/* isolated in its own <Suspense>, so a slow read never
// blocks the shell (PAGE-FRAMEWORK §5) and staff arrange them from the on-page Settings → Layout panel.
//
// STAFF-GATED: requireAdmin('janitor', { staff: 'platform' }) — everything here is sensitive; each
// linked area keeps its own gate. The modules render only through this gated route, so they never
// re-gate. The /admin/* group mounts its own info rail (page-chrome 'none'), so no rail registration
// is needed here.
export const dynamic = 'force-dynamic'

export default async function OperationsDashboard() {
  await requireAdmin('janitor', { staff: 'platform' })

  return (
    <AdminTemplate
      title="Operations"
      eyebrow="Domain"
      icon={SlidersHorizontal}
      width="wide"
      description="The platform machine. AI, content infrastructure, commerce, and the system trail at a glance, then every working surface, each a click from editing."
    >
      <PageModules route="/admin/operations" />
    </AdminTemplate>
  )
}
