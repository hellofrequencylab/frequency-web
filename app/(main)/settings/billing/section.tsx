import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Check, Wallet } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { billingEnabled } from '@/lib/billing/stripe'
import { confirmCheckout } from '@/lib/billing/checkout'
import { getConnectStatus, syncConnectedAccount, payoutsLive, canReceivePayouts, type ConnectStatus } from '@/lib/billing/connect'
import { ENTITLEMENT_LABEL, type EntitlementTier } from '@/lib/core/entitlement'
import { resolveMemberPaymentState } from '@/lib/pricing/dunning'
import { PastDueBanner } from '@/components/billing/past-due-banner'
import { ManageBillingButton } from './manage-button'
import { StartPayoutButton, ManagePayoutButton } from './payout-controls'
import { BundleSeatsSection } from './bundle-seats-section'
import { TipsReceivedSection } from './tips-received-section'

// The Plan and billing SECTION of the unified Settings page (DAWN 2 screen pass). This
// is the server half that used to be app/(main)/settings/billing/page.tsx, unchanged in
// behavior: the current plan card, the dunning banner (ADR-370), the checkout-return
// confirm fallback, and the Connect payouts card (ADR-175). Stripe return URLs still
// point at /settings/billing, which now redirects here preserving its query string, so
// `sessionId` / `payouts` arrive as /settings searchParams.

export async function PlanSection({
  sessionId,
  payouts,
}: {
  /** Stripe checkout session id from the ?session_id return param, if present. */
  sessionId?: string
  /** The ?payouts return param ('return' | 'refresh'), if present. */
  payouts?: string
}) {
  const me = await getCallerProfile()
  if (!me) redirect('/sign-in?next=/settings')

  // Webhook-independent fallback: when Stripe redirects back from a completed checkout,
  // confirm the session and flip the tier here (the webhook also does this, idempotently).
  let justUpgradedTo: EntitlementTier | null = null
  if (sessionId) {
    justUpgradedTo = await confirmCheckout(sessionId, me.id)
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

  // Dunning / past-due state (ADR-370). resolveMemberPaymentState is GATED on billingLive(): it returns
  // 'active' while billing is OFF, so the recovery banner is dark until launch (today's behavior).
  const paymentState = await resolveMemberPaymentState(me.id)

  // Payouts (ADR-175): show the Connect card to earners only. On return from the
  // hosted onboarding (?payouts=return) reconcile the account synchronously so the
  // card reflects reality immediately — the account.updated webhook also does this.
  const showPayouts = (await payoutsLive()) && (await canReceivePayouts(me.id, me.community_role))
  let payout: ConnectStatus | null = null
  if (showPayouts) {
    payout = payouts === 'return' ? await syncConnectedAccount(me.id) : await getConnectStatus(me.id)
  }

  return (
    <div>
      {/* Dunning recovery (ADR-370): dark until billing is live AND a payment fails/cancels. */}
      <PastDueBanner state={paymentState} />

      {justUpgradedTo && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-success/50 bg-success-bg/30 px-4 py-2.5 text-body-sm font-semibold text-success">
          <Check className="h-4 w-4" />{' '}
          {'You’re in. Welcome to the Crew.'}
        </div>
      )}

      <div className="rounded-card border border-border bg-surface p-5 lift-1">
        <p className="text-meta font-semibold uppercase tracking-wide text-subtle">Current plan</p>
        <p className="mt-1 text-body-lg font-bold text-text">
          {ENTITLEMENT_LABEL[tier]}
          {paid ? '' : <span className="font-normal text-muted"> · free tier</span>}
        </p>

        <div className="mt-4">
          {!live ? (
            <p className="text-body-sm leading-relaxed text-muted">
              Paid memberships aren’t turned on yet. Everything is free during the beta. You can
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
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-body-sm font-bold text-on-primary transition-colors hover:bg-primary-hover"
            >
              Join the Crew <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      {showPayouts && payout && (
        // The "Receive payments" menu seed (lib/nav/registry) deep-links here via /settings#payouts.
        <div id="payouts" className="mt-4 scroll-mt-24 rounded-card border border-border bg-surface p-5 lift-1">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-subtle" />
            <p className="text-meta font-semibold uppercase tracking-wide text-subtle">Receive payments</p>
          </div>

          {!live ? (
            <p className="mt-2 text-body-sm leading-relaxed text-muted">
              Payouts aren’t turned on yet. They go live with the rest of billing. You’ll set up
              where your earnings land here.
            </p>
          ) : payout.ready ? (
            <>
              <p className="mt-1 inline-flex items-center gap-1.5 text-body-lg font-bold text-success">
                <Check className="h-4 w-4" /> Payouts active
              </p>
              <p className="mt-1 text-body-sm leading-relaxed text-muted">
                You’re set up to receive earnings from memberships, events, tips, and store sales.
                Manage your bank details and payout schedule in your Stripe dashboard.
              </p>
              <div className="mt-4">
                <ManagePayoutButton />
              </div>
            </>
          ) : payout.onboarded ? (
            <>
              <p className="mt-1 text-body-lg font-bold text-text">Almost there</p>
              <p className="mt-1 text-body-sm leading-relaxed text-muted">
                Stripe is reviewing your details. This usually clears quickly. Check back, or open
                your dashboard to finish anything outstanding.
              </p>
              <div className="mt-4">
                <ManagePayoutButton />
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-body-sm leading-relaxed text-muted">
                Set up payouts to start receiving earnings from memberships, events, tips, and store
                sales. Stripe handles the bank details and verification securely.
              </p>
              <div className="mt-4">
                <StartPayoutButton label={payout.accountId ? 'Finish payout setup' : 'Set up payouts'} />
              </div>
            </>
          )}
        </div>
      )}

      {/* Tips received (scan2 L9-05): the one reader of a member's tips. Streams behind its own
          <Suspense> and renders nothing for a member who has never been tipped. */}
      <Suspense fallback={null}>
        <TipsReceivedSection />
      </Suspense>

      {/* Household bundle seats (ADR-370). Its own <Suspense> so the plan card never waits on the
          seat roster, and it renders nothing at all while the bundle flag is off. */}
      <Suspense fallback={null}>
        <BundleSeatsSection />
      </Suspense>
    </div>
  )
}
