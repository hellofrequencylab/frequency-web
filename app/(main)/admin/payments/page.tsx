import { CreditCard } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { FormSection } from '@/components/admin/form-section'
import { Banner } from '@/components/admin/status'
import { hostPayoutsEnabledFlag } from '@/lib/platform-flags'
import { billingEnabled } from '@/lib/billing/stripe'
import { PayoutsToggle } from './payments-toggle'

export const dynamic = 'force-dynamic'

// The operator switch for the Connect payout marketplace (ADR-178). Host payouts —
// tips, paid event tickets, and the future store/membership channels — stay OFF until a
// janitor turns them on here. Gated behind the platform flag AND a Stripe key. The
// SETTINGS template (ADR-233 §3.8): annotated FormSection (left copy, right control); the
// toggle autosaves with an inline "Saved".
export default async function AdminPaymentsPage() {
  await requireAdmin('janitor')
  const [enabled, stripeConfigured] = [await hostPayoutsEnabledFlag(), billingEnabled()]

  return (
    <AdminTemplate
      title="Payments"
      eyebrow="Operations"
      icon={CreditCard}
      description="Turn the host-payout marketplace on or off. Tips, paid event tickets, and store/membership sales."
    >
      <AdminSection>
        {enabled && !stripeConfigured && (
          <Banner tone="warning" title="No Stripe key configured">
            Payouts are on but stay dormant until the Stripe keys are set in this environment. Members
            won&rsquo;t see payment controls until both the switch and the keys are live.
          </Banner>
        )}
        <FormSection
          title="Host payouts"
          description="Controls host payment setup for supported selling paths, including tips and eligible paid tickets, store purchases and memberships. Availability also depends on the payment keys, Space plan and setup for each path."
        >
          <PayoutsToggle enabled={enabled} stripeConfigured={stripeConfigured} />
        </FormSection>
      </AdminSection>
    </AdminTemplate>
  )
}
