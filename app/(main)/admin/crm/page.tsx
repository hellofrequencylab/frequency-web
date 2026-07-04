import { Sparkles } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

// RESONANCE CRM — ALTITUDE 1, the Platform Resonance CRM (Resonance Engine Phase 2 · ADR-383 · ADR-459
// · docs/NEXT-GEN-CRM.md "The brilliant admin dashboard"). Module-driven (ADR-270/294): the page
// composes the AdminTemplate header, then renders <PageModules>, which lays out the VIEWER-FIRST member
// block (the scored roster + hero sort + live search), then the health cockpit (the computed verdict,
// the LIVE StatCard row, the who-needs-attention worklist, the lifecycle funnel), the rising-members
// pool, and the score-trustworthiness backtest, in the operator-chosen order. Each block is a
// self-fetching, fail-safe RSC in components/widgets/crm/* isolated in its own <Suspense>, so a slow
// read never blocks the shell (PAGE-FRAMEWORK §5) and every read degrades to a calm empty, never a crash.
//
// STAFF-GATED: requireAdmin('janitor') — a platform-wide member-health read is a sensitive operator
// view. The modules render only through this gated route, so they never re-gate. The member drilldowns
// live on /admin/crm/members (out of this page's scope). The /admin/* group mounts its own info rail
// (page-chrome 'none'), so no rail registration is needed here.
export const dynamic = 'force-dynamic'

export default async function PlatformCrmPage() {
  await requireAdmin('janitor')

  return (
    <AdminTemplate
      title="Resonance CRM"
      eyebrow="CRM"
      icon={Sparkles}
      description="Your whole scored roster up top, sorted by who joined most recently. The health read for the platform sits below."
      width="wide"
    >
      <PageModules route="/admin/crm" />
    </AdminTemplate>
  )
}
