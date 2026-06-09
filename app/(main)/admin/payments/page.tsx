import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { hostPayoutsEnabledFlag } from '@/lib/platform-flags'
import { billingEnabled } from '@/lib/billing/stripe'
import { PayoutsToggle } from './payments-toggle'

export const dynamic = 'force-dynamic'

// The operator switch for the Connect payout marketplace (ADR-178). Host payouts —
// tips, paid event tickets, and the future store/membership channels — stay OFF
// until a janitor turns them on here. Gated behind the platform flag AND a Stripe key.
export default async function AdminPaymentsPage() {
  await requireAdmin('janitor')
  const [enabled, stripeConfigured] = [await hostPayoutsEnabledFlag(), billingEnabled()]

  return (
    <AdminPage
      title="Payments"
      eyebrow="Platform"
      description="Turn the host-payout marketplace on or off — tips, paid event tickets, and store/membership sales."
    >
      <AdminSection>
        <PayoutsToggle enabled={enabled} stripeConfigured={stripeConfigured} />
      </AdminSection>
    </AdminPage>
  )
}
