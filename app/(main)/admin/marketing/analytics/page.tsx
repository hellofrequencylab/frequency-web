import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

export const dynamic = 'force-dynamic'

// Marketing analytics (ADR-233 §3 Analytics). Module-driven (ADR-270/294): the page composes the
// shared AdminTemplate header (the marketing layout owns the capability gate), then renders
// <PageModules>, which lays out the analytics blocks — the North Star band, the practice-retention
// cohort heatmap, the CRM counts, and the email log — in the operator-chosen order. Each block is a
// self-fetching RSC in components/widgets/marketing/* isolated in its own <Suspense>, so a slow read
// never blocks the shell (ADR-233 §5) and staff arrange them from the on-page Settings → Layout panel.
export default async function AnalyticsPage() {
  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Analytics"
      description="Read-models off the one event backbone + the email log."
      width="wide"
    >
      <PageModules route="/admin/marketing/analytics" />
    </AdminTemplate>
  )
}
