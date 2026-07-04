import { TrendingUp } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

// GROWTH, the growth engine's operator home as a single DASHBOARD (ADR-233 IA). Module-driven
// (ADR-270/294): the page composes the AdminTemplate header, then renders <PageModules>, which lays out
// the funnel & activation KPIs, the deal pipeline, expansion readiness, the Manage grid (one card per
// working sub-page across Acquisition, CRM, and Marketing), and the Related areas strip in the
// operator-chosen order. Each block is a self-fetching, fail-safe RSC in components/widgets/growth/*
// isolated in its own <Suspense>, so a slow read never blocks the shell (PAGE-FRAMEWORK §5).
//
// STAFF-GATED: requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' }) — a staff web_role OR
// a marketing team capability at READ, the loosest union so no operator loses access. Each tool
// sub-route (/admin/crm/*, /admin/marketing/*) re-gates. The modules render only through this gated
// route, so they never re-gate. The /admin/* group mounts its own info rail (page-chrome 'none'), so no
// rail registration is needed here.
export const dynamic = 'force-dynamic'

export default async function GrowthDashboard() {
  await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })

  return (
    <AdminTemplate
      title="Growth"
      eyebrow="Domain"
      icon={TrendingUp}
      width="wide"
      description="The growth engine in one place: the funnel and activation, the deal pipeline, and expansion at a glance, then every working surface, each a click from editing."
    >
      <PageModules route="/admin/growth" />
    </AdminTemplate>
  )
}
