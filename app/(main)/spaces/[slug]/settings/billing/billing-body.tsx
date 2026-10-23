import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { getPricingValues } from '@/lib/pricing/settings'
import { MemberPricingBox } from '@/components/pricing/member-pricing-box'
import { loadPricingBoxData, loadPersonalContext, loadSellable } from '@/lib/pricing/member-pricing-load'
import { asSpacePlan, SPACE_PLAN_LABEL } from '@/lib/pricing/plans'
import { TierChip } from '@/components/pricing/tier-chip'
import { activeAgreementForSpace, type AgreementMethod } from '@/lib/billing/manual-agreements'
import { formatAgreementRate } from '@/lib/billing/manual-agreement-dates'
import { getSpaceVerification } from '@/lib/spaces/nonprofit-verification'
import { spaceEarningsSummary } from '@/lib/commerce/orders'
import { NetworkReceipt } from './network-receipt'
import { ManageSubscriptionButton } from './manage-subscription'
import { loadExtraSpaceQuote } from '@/lib/collective/extra-space-billing'
import { loadMemberSpaceManagement } from '@/lib/collective/member-spaces-store'
import { MemberSpaceEditor } from './member-space-editor'

// BILLING BODY — the chrome-free plan-and-usage hub, lifted out of the standalone /settings/billing page
// (Stage D2) so it renders in TWO places from one source: (1) that page, wrapped in its FocusTemplate
// chrome, and (2) INLINE in the Space profile body as the Plan and usage `?panel=` workspace
// (components/spaces/workspace/space-body-panel.tsx). It owns NO page chrome (the caller frames it) and
// SELF-GATES server-side so it is safe to mount anywhere: it returns null when the viewer may not manage
// this Space (the standalone page still 404s via its own gate, so a null here never renders a bare 200).
//
// COLLAPSED MODEL (ADR-552): the plan model is free / business / nonprofit, where free-vs-paid is a USAGE
// STATE within Business (no tier ladder, no add-on loadout picker, no white-label lead capture). The
// surface is: the current plan, the usage-meter ladder, the seat counter, a single "Go Business" CTA,
// and a small Non Profit link. The CTA is GATED: spaceLoadoutSellable('business') is false while billing
// is OFF, so it renders a disabled "Available soon" preview. STAFF PREVIEW is read-only. No em dashes.

// Operator-facing labels for how a manual agreement settles (ADR-872). Plain words, no jargon.
const AGREEMENT_METHOD_LABEL: Record<AgreementMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  transfer: 'Bank transfer',
  other: 'Other',
}

export async function BillingBody({ slug }: { slug: string }) {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  // SELF-GATE on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). Render
  // nothing for everyone else — the standalone page adds its own notFound() so it still 404s.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) return null

  const brandName = space.brandName ?? space.name

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). Plan and billing default to ADMIN (money is an
  // admin tool), reproducing the intended threshold. A staff janitor keeps the read-only preview.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'billing', caps.role)) {
    return (
      <FeatureLockedNotice
        brandName={brandName}
        slug={space.slug}
        type={space.type}
        label="Plan and billing"
        reason={spaceFunctionAccess(space, 'billing', 'admin') ? 'role' : 'disabled'}
        canManageMembers={caps.canManageMembers}
      />
    )
  }

  // The plan lives on spaces.plan (untyped, ADR-246) — read it fail-safe.
  const { data: planRow } = (await createAdminClient()
    .from('spaces')
    .select('plan')
    .eq('id', space.id)
    .maybeSingle()) as { data: { plan?: string | null } | null }
  const currentPlan = asSpacePlan(planRow?.plan)
  const effectivePlan = asSpacePlan(space.plan)
  const hasInheritedBusiness = currentPlan === 'free' && effectivePlan === 'business'

  // The pricing box's inputs: the catalog (prices, copy, fees), which plans sell right now, the viewer's own
  // tier, and the Space's verification. Seats are included per tier (ADR-1810), so nothing here sells one.
  const [values, pricingData, sellable, personal, verification, earnings, manualAgreement] = await Promise.all([
    getPricingValues(),
    loadPricingBoxData(),
    loadSellable(),
    loadPersonalContext(caller?.realMembershipTier),
    getSpaceVerification(space.id),
    // The honest receipt (Phase 5): trailing 30-day earnings, split network-sourced vs self.
    spaceEarningsSummary(space.id, 30),
    // A MANUAL billing agreement (ADR-872): an off-Stripe cash/check deal the crew recorded. When
    // one is active, the surface shows its receipt card and hides the Stripe portal button (there
    // is no Stripe subscription behind a cash deal). Fail-safe null: no agreement, nothing shown.
    activeAgreementForSpace(space.id),
  ])

  const memberSpaces = !staffViewing && viewerProfileId ? await loadMemberSpaceManagement(space.id, viewerProfileId) : null
  const extraSpaceQuote = memberSpaces?.active ? await loadExtraSpaceQuote(space.id) : null
  const isPaid = currentPlan !== 'free'


  // The old "you'd have saved $X on Business" nudge is RETIRED (ADR-811): it applied the take-rate delta
  // to a Space's WHOLE processed volume, which now misstates the promise (we take 0% on a Space's own
  // bookings; the rate applies only to network-sourced business). The honest, per-dollar "the network
  // earned you $X" readout is the Phase 5 receipt; here the PlanLadder carries the ladder's promise
  // (hosting is free, selling starts at Business, ADR-1709). No stale total-volume dollar claim.

  return (
    <>
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <div className="space-y-8">
        <div className="rounded-card border border-border bg-surface px-5 py-4 lift-1">
          <p className="eyebrow text-subtle">Current plan</p>
          <p className="mt-1.5"><TierChip tier={currentPlan} size="lg" /></p>
          {hasInheritedBusiness && <p className="mt-2 text-body-sm text-muted">Business tools are included through the Network this Space belongs to. It keeps its own free plan.</p>}
        </div>

        {memberSpaces && <MemberSpaceEditor parentId={space.id} management={memberSpaces} quote={extraSpaceQuote} />}

        {/* MANUAL BILLING AGREEMENT (ADR-872): the read-only receipt for an off-Stripe deal the crew
            recorded. Shows the plan, the locked rate, how far the space is paid, and how it settles.
            No self-serve controls on purpose: the crew manages the deal. */}
        {manualAgreement && (
          <div className="rounded-card border border-border bg-surface px-5 py-4 lift-1">
            <p className="eyebrow text-subtle">Billing agreement</p>
            <p className="mt-1 text-body-sm font-semibold text-text">
              {SPACE_PLAN_LABEL[asSpacePlan(manualAgreement.plan)]} plan, billed{' '}
              {manualAgreement.interval === 'year' ? 'yearly' : 'monthly'}
            </p>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-body-sm sm:grid-cols-3">
              <div>
                <dt className="text-meta text-subtle">Your rate</dt>
                <dd className="font-medium text-text">
                  {manualAgreement.label ??
                    formatAgreementRate(manualAgreement.amountCents, manualAgreement.interval)}
                </dd>
              </div>
              <div>
                <dt className="text-meta text-subtle">Paid through</dt>
                <dd className="font-medium text-text">
                  {new Date(`${manualAgreement.paidThrough}T00:00:00Z`).toLocaleDateString('en-US', {
                    timeZone: 'UTC',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-meta text-subtle">Paid by</dt>
                <dd className="font-medium text-text">{AGREEMENT_METHOD_LABEL[manualAgreement.method]}</dd>
              </div>
            </dl>
            <p className="mt-3 text-meta text-muted">Managed by the crew. Questions? Reach out.</p>
          </div>
        )}

        {/* THE PRICING BOX: where this Space sits on the six-rung ladder, and the one place to compare, buy or
            change a plan. A free Space buys inline; a Space that already pays changes plan in the Stripe
            portal, so a second checkout can never bill it twice. Staff preview and non-owners see it read-only. */}
        <MemberPricingBox
          data={pricingData}
          focus="space"
          personal={personal}
          space={{
            slug: space.slug,
            name: brandName,
            plan: hasInheritedBusiness ? effectivePlan : currentPlan,
            canBuy: caps.isOwner && !staffViewing && !hasInheritedBusiness,
            paid: isPaid,
            verified: verification?.status === 'verified',
            inherited: hasInheritedBusiness,
            managed: !!manualAgreement,
            sellable,
          }}
        />

        {/* The honest receipt (Phase 5, ADR-811 §A): the real dollars the network sourced, proving promise
            #4. Renders nothing until there is network-sourced business, so it never brags about zero. */}
        <NetworkReceipt earnings={earnings} />

        {/* Already paying: the self-serve subscription control. Opens the Stripe billing portal (payment
            method, plan change/cancel). Owner action; hidden in staff
            preview (read-only). A paid space that has no Stripe customer yet just gets a clean error.
            Hidden while a MANUAL agreement is active (ADR-872): a cash deal has no Stripe portal, so
            the button would only ever error; the agreement card above carries the state instead. */}
        {isPaid && !staffViewing && !manualAgreement && <ManageSubscriptionButton slug={space.slug} />}

        {/* Non Profit is the verified-501(c)(3) sibling plan (ADR-811): everything Business does, with
            no network fee, at a flat monthly price, never per seat. The self-serve verification flow (ADR-552, AUDIT #6) lives
            at settings/billing/verify: the owner submits their EIN + legal name, an operator reviews it,
            and approval unlocks the Non Profit checkout (LIVE-994). We show the current request status if one exists,
            otherwise the "get verified" invite. */}
        <div className="rounded-card border border-border bg-surface px-5 py-4">
          <p className="text-body-sm font-semibold text-text">Non Profit</p>
          {verification?.status === 'verified' ? (
            <>
              <p className="mt-0.5 text-meta leading-relaxed text-muted">
                {currentPlan === 'nonprofit'
                  ? 'Verified 501(c)(3). This space is on the Non Profit plan: everything Business does, with no network fee, at one flat monthly price, never per seat.'
                  : `Verified 501(c)(3). Switch on Verified nonprofit in the plans above to choose Non Profit pricing: everything Business does, with no network fee, at one flat monthly price, never per seat. Starts with a ${values.trial.days}-day free trial.`}
              </p>
            </>
          ) : verification?.status === 'pending' ? (
            <p className="mt-0.5 text-meta leading-relaxed text-muted">
              Your 501(c)(3) verification is in review.{' '}
              <a href={`/spaces/${space.slug}/settings/billing/verify`} className="font-semibold text-primary-strong underline">
                Check status
              </a>
              .
            </p>
          ) : (
            <p className="mt-0.5 text-meta leading-relaxed text-muted">
              Verified 501(c)(3) organizations get everything Business does, with no network fee, at one
              flat monthly price, never per seat.{' '}
              <a href={`/spaces/${space.slug}/settings/billing/verify`} className="font-semibold text-primary-strong underline">
                {verification?.status === 'rejected' ? 'Submit a new request' : 'Get verified'}
              </a>
              .
            </p>
          )}
        </div>
      </div>
    </>
  )
}
