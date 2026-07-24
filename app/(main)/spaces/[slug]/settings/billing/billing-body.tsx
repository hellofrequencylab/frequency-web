import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { getPricingValues, billingLive } from '@/lib/pricing/settings'
import { spaceLoadoutSellable, operatorSeatsSellable } from '@/lib/billing/space-plan-checkout'
import { loadCatalogConfig, catalogConfigByKey } from '@/lib/pricing/catalog-config'
import { BASE_SEAT_ALLOWANCE } from '@/lib/spaces/seats'
import { asSpacePlan, SPACE_PLAN_LABEL } from '@/lib/pricing/plans'
import { getSeatUsage } from '@/lib/spaces/seats'
import { SeatCounter } from '@/components/spaces/seat-counter'
import { SectionHeader } from '@/components/ui/section-header'
import { FeatureMeterRange } from '@/components/pricing/feature-meter-range'
import { FEATURE_METERS } from '@/lib/pricing/feature-meters'
import { getSpaceVerification } from '@/lib/spaces/nonprofit-verification'
import { spaceEarningsSummary } from '@/lib/commerce/orders'
import { GoBusinessCta } from './go-business'
import { PlanLadder } from './plan-ladder'
import { NetworkReceipt } from './network-receipt'
import { ManageSubscriptionButton } from './manage-subscription'
import { SeatEditor } from './seat-editor'

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

// The plan-axis usage meters (ADR-519 / ADR-520 P3): every metered Space feature, so the Plan and usage
// hub is the single "where am I on the ladder" answer. Personal (tier-axis) meters are excluded.
const PLAN_USAGE_METERS = Object.values(FEATURE_METERS).filter((m) => m.axis === 'plan')

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

  // The Business checkout gate (billingLive AND the per-plan switch — both false while billing is OFF, so
  // the CTA renders as a disabled "Available soon" preview), plus the seat usage + billing-live flag.
  const [values, businessSellable, seatsSellable, seatUsage, billingIsLive, verification, catalog, earnings] =
    await Promise.all([
      getPricingValues(),
      spaceLoadoutSellable('business'),
      operatorSeatsSellable(),
      getSeatUsage(space.id),
      billingLive(),
      getSpaceVerification(space.id),
      loadCatalogConfig(),
      // The honest receipt (Phase 5): trailing 30-day earnings, split network-sourced vs self.
      spaceEarningsSummary(space.id, 30),
    ])

  const isPaid = currentPlan !== 'free'

  // The resolved (operator-set) per-seat monthly price, so the seat pickers can show what a chosen
  // quantity actually costs instead of leaving the count priceless. The FOUNDING amount is the one charged.
  const seatMonthlyCents = catalogConfigByKey(catalog).operator_seat.monthlyFoundingCents
  // Downgrade floor: the licensed total (base + seatQuantity) must cover the operators already active, so
  // the minimum safe seatQuantity is used - the free base allowance. Reducing below it would leave active
  // operators over the licensed count. `used` counts member-operators only (the owner rides the base seat).
  const minSeats = Math.max(0, seatUsage.used - BASE_SEAT_ALLOWANCE)

  // The old "you'd have saved $X on Business" nudge is RETIRED (ADR-811): it applied the take-rate delta
  // to a Space's WHOLE processed volume, which now misstates the promise (we take 0% on a Space's own
  // bookings; the rate applies only to network-sourced business). The honest, per-dollar "the network
  // earned you $X" readout is the Phase 5 receipt; here the PlanLadder carries the buy-down-your-rate
  // framing instead. No stale total-volume dollar claim.

  return (
    <>
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <div className="space-y-8">
        <div className="rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-subtle">Current plan</p>
          <p className="mt-1 text-lg font-bold text-text">{SPACE_PLAN_LABEL[currentPlan]}</p>
        </div>

        {/* The Community Collective ladder (ADR-811): where this Space sits + the buy-down-your-rate
            promise. Informational and OFF-safe; the one live upgrade action stays the Business CTA below. */}
        <PlanLadder currentPlan={currentPlan} />

        {/* The honest receipt (Phase 5, ADR-811 §A): the real dollars the network sourced, proving promise
            #4. Renders nothing until there is network-sourced business, so it never brags about zero. */}
        <NetworkReceipt earnings={earnings} />

        {/* USAGE METERS (ADR-519 / ADR-520 P3): the ladder for every metered tool in one place, the
            current plan highlighted. Nothing charges or blocks (billing is on hold); the meters are
            informational. This is the single "where am I on the ladder" answer. */}
        <section>
          <SectionHeader title="Usage" />
          <div className="space-y-4">
            {PLAN_USAGE_METERS.map((ladder) => (
              <FeatureMeterRange
                key={ladder.featureKey}
                ladder={ladder}
                currentTier={currentPlan}
                upgradeHref={`/spaces/${space.slug}/settings/billing`}
                live={billingIsLive}
              />
            ))}
          </div>
        </section>

        {/* The seat counter (Phase D, ADR-465): X of Y operator seats used. A preview while billing is
            OFF; reflects the real allowance + enforcement when live. */}
        <SeatCounter
          usage={seatUsage}
          billingHref={`/spaces/${space.slug}/settings/members`}
          enforced={billingIsLive}
          canManage={false}
        />

        {/* The single upgrade CTA. A free Space goes Business (the one paid tier). Staff preview is
            read-only (the fieldset disables it). Already-paid Business spaces do not see the CTA. */}
        {!isPaid && (
          <fieldset disabled={staffViewing} className="contents">
            <GoBusinessCta
              slug={space.slug}
              sellable={businessSellable}
              seatsSellable={seatsSellable}
              seatMonthlyCents={seatMonthlyCents}
              trialDays={values.trial.days}
            />
            {/* Founding Business (ADR-804): the per-city fee-buydown cohort. A locked founder rate and a
                marketplace fee bought down to the lowest on the platform, grandfathered for life. The
                linked checkout is GATED (inert until billing is live), so this is a preview link today. */}
            <p className="mt-2 text-xs text-subtle">
              First business in your city?{' '}
              <a
                href={`/spaces/${space.slug}/settings/billing/founding`}
                className="font-semibold text-primary-strong underline"
              >
                See the Founding Business rate
              </a>
              , a locked founder price and a lower marketplace fee for life.
            </p>
          </fieldset>
        )}

        {/* Already paying: the self-serve subscription control. Opens the Stripe billing portal (payment
            method, plan change/cancel, seats where the portal allows). Owner action; hidden in staff
            preview (read-only). A paid space that has no Stripe customer yet just gets a clean error. */}
        {isPaid && !staffViewing && <ManageSubscriptionButton slug={space.slug} />}

        {/* Direct operator-seat editor (A4/A5): change the licensed seat count on the live subscription
            with proration. Only when paying AND seats are sellable (activated + priced), so it stays
            hidden while seats are inert. Guarantees seat management even if the Stripe portal is not
            configured to expose seat quantities. */}
        {isPaid && !staffViewing && seatsSellable && (
          <SeatEditor
            slug={space.slug}
            initialSeats={seatUsage?.seatQuantity ?? 0}
            seatMonthlyCents={seatMonthlyCents}
            usedSeats={seatUsage.used}
            minSeats={minSeats}
          />
        )}

        {/* Non Profit is the verified-501(c)(3) sibling of Business (same depth, discounted per seat). The
            self-serve verification flow (ADR-552, AUDIT #6) lives at settings/billing/verify: the owner
            submits their EIN + legal name, an operator reviews it, and approval grants the Non Profit plan.
            We show the current request status if one exists, otherwise the "get verified" invite. */}
        <div className="rounded-2xl border border-border bg-surface px-5 py-4">
          <p className="text-sm font-semibold text-text">Non Profit</p>
          {verification?.status === 'verified' ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Verified 501(c)(3). This space is eligible for the Non Profit plan: the full Business depth,
              discounted per licensed seat.
            </p>
          ) : verification?.status === 'pending' ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Your 501(c)(3) verification is in review.{' '}
              <a href={`/spaces/${space.slug}/settings/billing/verify`} className="font-semibold text-primary-strong underline">
                Check status
              </a>
              .
            </p>
          ) : (
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Verified 501(c)(3) organizations get the full Business depth, discounted, per licensed seat.{' '}
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
