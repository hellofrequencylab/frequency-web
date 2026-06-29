import { requireAdmin } from '@/lib/admin/guard'
import { DashboardTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'
import { NewPracticeButton } from '@/components/studio/practice/new-practice-button'

// The practice curation workspace (ADR-438, PRACTICE-LIBRARY §7). Module-driven (ADR-270/294): the
// page gates access + composes the shared DashboardTemplate header, then renders <PageModules>,
// which lays out the curation blocks — the stat band, the review queue, the "needs attention"
// quality panel, the faceted library table, and tag governance — in the operator-chosen template +
// order. Staff arrange it from the on-page Settings → Layout panel (the route is registered in
// lib/widgets/module-routes.ts). Each block is a self-fetching RSC in components/widgets/practices/
// admin/* that returns null when empty.
//
// The faceted library (admin-practices-library) is URL-driven — filters / sort / cursor / page live
// in this page's searchParams, which never reach a nested module. They reach it through the shared,
// request-cached context (lib/admin/practices-context.ts), which reads the `x-search` request header
// the proxy stamps on every route (proxy.ts) — the SAME seam the member /practices library module
// uses. So the library converts cleanly to a module (the §D faceted-library nuance: threading is
// clean, no change to the shared PageModules infra), and the page no longer touches searchParams.
//
// The stats band is now a module too (admin-practices-stats), not the DashboardTemplate `stats`
// slot, so an operator can place it anywhere — the recipe prefers stats AS a module.
export default async function AdminContentPracticesPage() {
  await requireAdmin('host', { staff: 'community' })

  return (
    <DashboardTemplate
      eyebrow="Content"
      title="Practices"
      description="The practice library, ranked by real usage. Filter by any signal, then tune what is public, what is a starter template, and what gets featured."
      width="wide"
      actions={<NewPracticeButton label="Add practice" />}
    >
      <PageModules route="/admin/content/practices" />
    </DashboardTemplate>
  )
}
