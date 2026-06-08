import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { billingEnabled } from '@/lib/billing/stripe'
import { confirmCheckout } from '@/lib/billing/checkout'
import { ENTITLEMENT_LABEL, type EntitlementTier } from '@/lib/core/entitlement'
import { FocusTemplate } from '@/components/templates'
import { ManageBillingButton } from './manage-button'

export const dynamic = 'force-dynamic'

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; upgraded?: string }>
}) {
  const me = await getCallerProfile()
  if (!me) redirect('/sign-in?next=/settings/billing')

  // Webhook-independent fallback: when Stripe redirects back from a completed checkout,
  // confirm the session and flip the tier here (the webhook also does this, idempotently).
  const params = await searchParams
  let justUpgradedTo: EntitlementTier | null = null
  if (params.session_id) {
    justUpgradedTo = await confirmCheckout(params.session_id, me.id)
  }

  // Read the tier fresh (getCallerProfile is request-cached and may pre-date the confirm).
  const { data: fresh } = await createAdminClient()
    .from('profiles')
    .select('membership_tier')
    .eq('id', me.id)
    .maybeSingle()
  const tier = (fresh?.membership_tier ?? me.membershipTier ?? 'free') as EntitlementTier
  const live = billingEnabled()
  const paid = tier !== 'free'

  return (
    <FocusTemplate
      title="Membership & billing"
      description="Your plan and payment."
      back={{ href: '/settings', label: 'Settings' }}
    >
      {justUpgradedTo && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-success/50 bg-success-bg/30 px-4 py-2.5 text-sm font-semibold text-success">
          <Check className="h-4 w-4" />{' '}
          {justUpgradedTo === 'supporter'
            ? 'You’re in — thank you for supporting Frequency.'
            : 'You’re in — welcome to the Crew.'}
        </div>
      )}

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
