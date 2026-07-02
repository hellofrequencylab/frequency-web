import { Network } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

// RESONANCE GRAPH, the consent-first relationship + health view (Resonance Engine · ADR-389 ·
// docs/ADMIN-BUILD-PLAN.md Phase 3b · docs/NEXT-GEN-CRM.md "The Resonance Graph"). Module-driven
// (ADR-270/294): the page composes the AdminTemplate header, then renders <PageModules>, which lays
// out the metric row and the ranked strongest-connections list in the operator-chosen order. Each
// block is a self-fetching RSC in components/widgets/crm/* isolated in its own <Suspense>, so a slow
// read never blocks the shell and staff arrange them from the on-page Settings → Layout panel.
//
// CONSENT IS MANDATORY (the trust moat). An edge only ever exists for two members who BOTH opted in
// to matching (the nightly refresh + the read both enforce it), so this page can NEVER fabricate or
// over-surface a connection. The connections block shows the consent gate plainly when no one has
// opted in. This is the literal expression of resonate, do not extract.
//
// STAFF-GATED: requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' }) — the per-member
// relationship graph is sensitive, so it needs the staff floor OR a read-level insights staff role.
// The modules render only through this gated route, so they never re-gate. The /admin/* group mounts
// its own info rail (page-chrome 'none'), so no rail registration is needed here.
export const dynamic = 'force-dynamic'

export default async function ResonanceGraphPage() {
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })

  return (
    <AdminTemplate
      title="Resonance Graph"
      eyebrow="CRM"
      icon={Network}
      description="Who resonates with whom, double opt-in only. A connection shows here only when both members chose to be matched, so this is consent first by construction."
      width="wide"
    >
      <PageModules route="/admin/crm/graph" />
    </AdminTemplate>
  )
}
