import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { billingEnabled } from '@/lib/billing/stripe'
import { ENTITLEMENT_LABEL, type EntitlementTier } from '@/lib/core/entitlement'
import { FocusTemplate } from '@/components/templates'
import { ManageBillingButton } from './manage-button'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const me = await getCallerProfile()
  const tier = (me?.membershipTier ?? 'free') as EntitlementTier
  const live = billingEnabled()
  const paid = tier !== 'free'

  return (
    <FocusTemplate
      title="Membership & billing"
      description="Your plan and payment."
      back={{ href: '/settings', label: 'Settings' }}
    >
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Current plan</p>
        <p className="mt-1 text-lg font-bold text-text">
          {ENTITLEMENT_LABEL[tier]}
          {paid ? '' : <span className="font-normal text-muted"> · free tier</span>}
        </p>

        <div className="mt-4">
          {!live ? (
            <p className="text-sm leading-relaxed text-muted">
              Paid memberships aren’t turned on yet — everything is free during the beta. You can
              switch tiers on the{' '}
              <Link href="/upgrade" className="font-medium text-primary-strong hover:underline">
                membership page
              </Link>
              .
            </p>
          ) : paid ? (
            <ManageBillingButton />
          ) : (
            <Link
              href="/upgrade"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
            >
              Join the Crew <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </FocusTemplate>
  )
}
