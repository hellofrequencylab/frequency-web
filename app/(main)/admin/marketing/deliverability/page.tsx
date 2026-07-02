import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

export const dynamic = 'force-dynamic'

// Outbox deliverability + dead-letter recovery (GE6-1). The durable outbox retries with backoff and
// parks exhausted jobs in a terminal "failed" (dead-letter) state. Module-driven (ADR-270/294): the
// page re-asserts the marketing-staff gate (the page reads the admin client, so the gate stays the
// authority), composes the shared AdminTemplate header, then renders <PageModules>, which lays out
// the two blocks — queue health and the dead-letter queue with one-tap requeue. Each is a
// self-fetching RSC in components/widgets/marketing/* isolated in its own <Suspense>.
export default async function DeliverabilityPage() {
  // Re-gate server-side (the page reads the admin client): marketing staff only.
  await requireAdmin('host', { staff: 'marketing' })

  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Deliverability"
      description="The outbox health: the live send backlog and the dead-letter queue. Every email and push is queued, retried with backoff, and parked here if it exhausts its attempts. Requeue a dead-letter once the cause is fixed."
      width="wide"
    >
      <PageModules route="/admin/marketing/deliverability" />
    </AdminTemplate>
  )
}
