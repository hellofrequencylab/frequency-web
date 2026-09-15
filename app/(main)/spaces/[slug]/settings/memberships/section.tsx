import { Suspense } from 'react'
import Link from 'next/link'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listAllMembershipTiers } from '@/lib/spaces/memberships'
import { listSpaceEventAccess } from '@/lib/events/space-event-access'
import { featureAllowed, loadFeatureGateOverrides } from '@/lib/pricing/gates'
import { featureWallLabel } from '@/lib/pricing/feature-tiers'
import { METER_UPSELL_CTA } from '@/lib/pricing/meter-upsell'
import { featureGatesLive } from '@/lib/pricing/settings'
import { asSpacePlan, SPACE_PLAN_LABEL } from '@/lib/pricing/plans'
import { isError } from '@/lib/action-result'
import { MembershipTierForm } from '@/components/spaces/membership-tier-form'
import { MembershipOwnerList } from '@/components/spaces/membership-owner-list'
import { MembershipEventAccess } from '@/components/spaces/membership-event-access'
import { MembershipCircleAccess } from '@/components/spaces/membership-circle-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { listCirclesForSpace } from '@/lib/circles/store'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { MeterUpsell } from '@/components/pricing/meter-upsell'
import { GateNotice } from '@/components/ui/gate-notice'
import { SectionHeader } from '@/components/ui/section-header'
import type { Space } from '@/lib/spaces/types'

// MEMBERSHIPS section BODY (extracted from memberships/page.tsx so the unified Offerings surface can
// compose it as one stacked section). The route + auth gate stays on the caller (the Offerings page).
// The WRITE action (setMembershipTiers, behind MembershipTierForm) is unchanged and stays the source
// of truth (canEditProfile server-side). This component re-checks the memberships function gate and
// loads the same data the page always loaded.
//
// MONEY IS REAL ON THIS SURFACE. The price and interval an owner sets here are what a member is charged:
// a paid tier is joined through Stripe Connect Checkout (lib/billing/space-membership-checkout.ts), and a
// cancel stops the subscription. That is why the section carries the plan ladder rather than a "later"
// note: publishing any tier at all is a Business capability (ADR-914, enforced in setMembershipTiers), the
// FeatureLockedNotice names space_membership_tiers so a plan-reason lock renders its upsell, and MeterUpsell
// warns at 80% of the tier allowance. Active members stay unmetered on purpose. No em/en dashes.
//
// THE WALL IS SAID OUT LOUD HERE, NOT DISCOVERED AT SAVE (LIVE-231, docs/CORE-MODEL.md §5 phase 4). The
// `memberships` FUNCTION is universal (entitlement null), so a free Space with the role walked straight
// into the tier editor and met the Business wall only as a red error under the save button, worded by
// the action. Now the section asks the same `featureAllowed('space_memberships')` seam the write asks,
// and a Space below the wall reads WHY before it types a tier name: a membership is the repeat ADR-914
// gates, so charging members comes with Business. The plan's NAME is read off the merged gate
// (featureWallLabel over the same overrides the seam enforces), never typed. The notice is the house
// GateNotice (no padlock, DAWN §5) and its one door is the billing surface every meter upsell already
// links to (METER_UPSELL_CTA). A Space that DOWNGRADED with tiers still listed keeps the editor under the
// notice, because clearing tiers is always allowed and hiding the form would trap it (memberships.ts).

export async function MembershipsSection({
  space,
  viewerProfileId,
  staffViewing,
}: {
  space: Space
  viewerProfileId: string | null
  staffViewing: boolean
}) {
  const brandName = space.brandName ?? space.name

  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'memberships', caps.role)) {
    return (
      <FeatureLockedNotice
        brandName={brandName}
        slug={space.slug}
        type={space.type}
        label="Memberships"
        reason={spaceFunctionAccess(space, 'memberships', 'admin') ? 'role' : 'disabled'}
        canManageMembers={caps.canManageMembers}
        // Phase 4 (docs/VALUE-LADDER.md A3): this notice mounted with NO featureKey, so a plan-reason
        // gap rendered no upsell at all. The METERED quantity here is the number of membership TIERS a
        // Space may define; active members are deliberately unmetered (capping them would punish a
        // Space for growing, ADR-914).
        featureKey="space_membership_tiers"
        currentPlan={space.plan}
      />
    )
  }

  const tiers = await listAllMembershipTiers(space.id)

  // Staff keep their read-only preview of the editor whatever the plan; every write re-gates.
  const canSell =
    staffViewing ||
    (await featureAllowed(
      'space_memberships',
      { plan: asSpacePlan(space.plan) },
      { gatesLive: await featureGatesLive() },
    ))

  if (!canSell) {
    // The same overrides the seam just enforced (memoized per request), so the name and the gate agree.
    const wall =
      featureWallLabel('space_memberships', await loadFeatureGateOverrides()) ?? SPACE_PLAN_LABEL.business
    const notice = (
      <MembershipWallNotice
        wall={wall}
        slug={space.slug}
        canManageMembers={caps.canManageMembers}
      />
    )
    // Nothing to clear and nothing to list: the sentence is the whole section.
    if (tiers.length === 0) return notice
    return (
      <div className="space-y-8">
        {notice}
        <fieldset className="contents">
          <MembershipTierForm spaceId={space.id} slug={space.slug} initialTiers={tiers} />
        </fieldset>
        <section>
          <SectionHeader title="Members" />
          <Suspense fallback={<MembersSkeleton />}>
            <MembershipOwnerList spaceId={space.id} />
          </Suspense>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Phase 4 (docs/VALUE-LADDER.md): the space_membership_tiers meter's in-context prompt. The tier
          list is already loaded, so the count is exact. Appears at 80% of the allowance, names the
          tiers this Space already built, and blocks nothing. */}
      <MeterUpsell
        featureKey="space_membership_tiers"
        currentTier={space.plan}
        usage={tiers.length}
        upgradeHref={`/spaces/${space.slug}/settings/billing`}
      />

      {/* A disabled fieldset renders the editor READ-ONLY for a staff preview (it natively disables
          every nested control in the form). `display: contents` keeps it out of the layout box. */}
      <fieldset disabled={staffViewing} className="contents">
        <MembershipTierForm spaceId={space.id} slug={space.slug} initialTiers={tiers} />
      </fieldset>

      {/* CIRCLE ACCESS (ADR-859): the circle each tier includes. The circle is the tier's
          communications hub: its gatherings and its Message center audience. Linking sweeps the
          tier's current members in; the membership lifecycle keeps it in sync from then on. */}
      <section>
        <SectionHeader title="Circle access" />
        <p className="mb-3 text-body-sm text-muted">
          Give each membership its own circle. Members join it automatically while their
          membership is active, and its gatherings show on your space calendar.
        </p>
        <Suspense fallback={<MembersSkeleton />}>
          <CircleAccessLoader space={space} staffViewing={staffViewing} />
        </Suspense>
      </section>

      {/* EVENT ACCESS (ADR-824): which upcoming events a membership includes. Writes the ADR-823
          members-ticket gate on the event, the same rows the event's own ticket editor manages. */}
      <section>
        <SectionHeader title="Event access" />
        <p className="mb-3 text-body-sm text-muted">
          Include your events with a membership. Pick who gets the free Members ticket on each.
        </p>
        <Suspense fallback={<MembersSkeleton />}>
          <EventAccessLoader space={space} tiers={tiers} staffViewing={staffViewing} />
        </Suspense>
      </section>

      <section>
        <SectionHeader title="Members" />
        <Suspense fallback={<MembersSkeleton />}>
          <MembershipOwnerList spaceId={space.id} />
        </Suspense>
      </section>
    </div>
  )
}

/** The honest sentence at the point of tier creation (LIVE-231). What charging members is part of
 *  (the wall's plan, by name), why (a membership is a recurring promise, ADR-914), and the one door
 *  (the billing surface, the same link every meter upsell uses). No padlock: the GateNotice `gated`
 *  kind is the house vocabulary for "this comes with a plan step". Voice per CONTENT-VOICE §10: plain
 *  sentences, no narrated feelings, no em dashes. A viewer who cannot change the plan is pointed at
 *  an admin instead of at billing. */
function MembershipWallNotice({
  wall,
  slug,
  canManageMembers,
}: {
  wall: string
  slug: string
  canManageMembers: boolean
}) {
  return (
    <GateNotice
      kind="gated"
      title={`Charging your members is part of ${wall}`}
      action={
        canManageMembers ? (
          <Link
            href={`/spaces/${slug}/settings/billing`}
            className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3.5 py-2 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            {METER_UPSELL_CTA}
          </Link>
        ) : undefined
      }
    >
      <p>
        A membership is a promise to someone else: they pay every month and expect you to still be
        here. That is why it comes with {wall} and not with a free Space.
      </p>
      <p>
        Tickets, donations, and your shop stay open on every plan.
        {canManageMembers ? '' : ' Ask an admin about the plan for this space.'}
      </p>
    </GateNotice>
  )
}

// Self-fetching loader for the Event access panel: the upcoming events + their current audience
// (manager-gated read) and the Collective plan gate the selects need.
async function EventAccessLoader({
  space,
  tiers,
  staffViewing,
}: {
  space: Space
  tiers: { id?: string; name: string }[]
  staffViewing: boolean
}) {
  const [access, allowed] = await Promise.all([
    listSpaceEventAccess(space.id),
    (async () =>
      featureAllowed(
        'space_membership_tickets',
        { plan: asSpacePlan(space.plan) },
        { gatesLive: await featureGatesLive() },
      ))(),
  ])
  const rows = isError(access) ? [] : access.data.rows
  return (
    <fieldset disabled={staffViewing} className="contents">
      <MembershipEventAccess
        spaceId={space.id}
        slug={space.slug}
        rows={rows}
        membershipTiers={tiers.filter((t) => t.id).map((t) => ({ id: t.id!, name: t.name }))}
        allowed={allowed}
      />
    </fieldset>
  )
}

// Dimension-matched skeleton for the streamed members list (no CLS, PAGE-FRAMEWORK §5.4).
function MembersSkeleton() {
  return (
    <div className="space-y-px rounded-card border border-border bg-surface p-2 lift-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-elevated/50" />
      ))}
    </div>
  )
}

/** Tiers with their circle link + the Space's circles for the picker (ADR-859). The circle_id
 *  column is newer than the generated types (ADR-246), so the link read is a loose cast. */
async function CircleAccessLoader({ space, staffViewing }: { space: Space; staffViewing: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as unknown as { from: (t: string) => any }
  const [tiersRes, circles] = await Promise.all([
    db
      .from('space_membership_tiers')
      .select('id, name, circle_id')
      .eq('space_id', space.id)
      .eq('is_active', true)
      .order('sort', { ascending: true }),
    listCirclesForSpace(space.id),
  ])
  const tiers = ((tiersRes?.data ?? []) as { id: string; name: string | null; circle_id: string | null }[]).map(
    (t) => ({ id: t.id, name: t.name || 'Membership', circleId: t.circle_id }),
  )
  return (
    <fieldset disabled={staffViewing} className="contents">
      <MembershipCircleAccess
        spaceId={space.id}
        tiers={tiers}
        circles={circles.filter((c) => c.status !== 'archived').map((c) => ({ id: c.id, name: c.name }))}
      />
    </fieldset>
  )
}
