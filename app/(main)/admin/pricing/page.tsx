import { CreditCard } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { getPricingConsoleData } from './load'
import { PricingConsole } from './pricing-console'

export const dynamic = 'force-dynamic'

// The PRICING console (ADR-362, docs/PRICING.md). Operator-owned plans, prices, feature gates, and
// the switches that govern billing. EVERYTHING SHIPS OFF: the master billing_live switch is OFF, no
// tier/plan is enabled, and nothing charges (Stripe wiring is P2). Janitor-gated, matching this
// page's entry in app/(main)/admin/sections.ts (Operations > Platform). Composes the admin kit.
export default async function AdminPricingPage() {
  await requireAdmin('janitor')
  const data = await getPricingConsoleData()

  return (
    <AdminTemplate
      title="Pricing"
      eyebrow="Operations"
      icon={CreditCard}
      width="wide"
      description="Plans, prices, and the switches that govern billing. Nothing charges yet: the master switch is off and Stripe is wired in a later phase. Every value here is editable and every change is logged."
    >
      <PricingConsole data={data} />
    </AdminTemplate>
  )
}
