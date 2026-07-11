import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { getPricingValues, billingLive } from '@/lib/pricing/settings'
import { spaceLoadoutSellable } from '@/lib/billing/space-plan-checkout'
import { asSpacePlan, SPACE_PLAN_LABEL } from '@/lib/pricing/plans'
import { getSeatUsage } from '@/lib/spaces/seats'
import { SeatCounter } from '@/components/spaces/seat-counter'
import { SectionHeader } from '@/components/ui/section-header'
import { FeatureMeterRange } from '@/components/pricing/feature-meter-range'
import { FEATURE_METERS } from '@/lib/pricing/feature-meters'
import { monthlyTakeRateSavingsCents } from '@/lib/billing/pricing-keys'
import { spaceTrailingProcessedCents } from '@/lib/commerce/orders'
import { getSpaceVerification } from '@/lib/spaces/nonprofit-verification'
import { GoBusinessCta } from './go-business'

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
  const [values, businessSellable, seatUsage, billingIsLive, trailingVolumeCents, verification] = await Promise.all([
    getPricingValues(),
    spaceLoadoutSellable('business'),
    getSeatUsage(space.id),
    billingLive(),
    spaceTrailingProcessedCents(space.id),
    getSpaceVerification(space.id),
  ])

  const isPaid = currentPlan !== 'free'

  // The "you'd have saved $X" nudge (ADR-552, the self-funding trigger): the take-rate delta a free
  // space would get on paid Business, applied to its trailing monthly processed volume. Whole dollars,
  // shown only when it is a real, positive saving and they are not already paying. Plain voice, no
  // "unlock", no em dashes (CONTENT-VOICE.md). Volume is sourced from settled commerce orders (the one
  // per-space money read that exists); it undercounts ticket/tip/dues channels until those are wired.
  const savingsCents = monthlyTakeRateSavingsCents(trailingVolumeCents, values.take_rate)
  const savingsDollars = Math.floor(savingsCents / 100)

  return (
    <>
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <div className="space-y-8">
        <div className="rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-subtle">Current plan</p>
          <p className="mt-1 text-lg font-bold text-text">{SPACE_PLAN_LABEL[currentPlan]}</p>
        </div>

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
            {savingsDollars > 0 && (
              <p className="mb-3 text-sm font-medium text-text">
                You&rsquo;d have saved ${savingsDollars.toLocaleString('en-US')} this month on Business.
              </p>
            )}
            <GoBusinessCta slug={space.slug} sellable={businessSellable} trialDays={values.trial.days} />
          </fieldset>
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
