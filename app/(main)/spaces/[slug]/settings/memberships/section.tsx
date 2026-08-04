import { Suspense } from 'react'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listAllMembershipTiers } from '@/lib/spaces/memberships'
import { listSpaceEventAccess } from '@/lib/events/space-event-access'
import { featureAllowed } from '@/lib/pricing/gates'
import { featureGatesLive } from '@/lib/pricing/settings'
import { asSpacePlan } from '@/lib/pricing/plans'
import { isError } from '@/lib/action-result'
import { MembershipTierForm } from '@/components/spaces/membership-tier-form'
import { MembershipOwnerList } from '@/components/spaces/membership-owner-list'
import { MembershipEventAccess } from '@/components/spaces/membership-event-access'
import { MembershipCircleAccess } from '@/components/spaces/membership-circle-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { listCirclesForSpace } from '@/lib/circles/store'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { MeterUpsell } from '@/components/pricing/meter-upsell'
import { SectionHeader } from '@/components/ui/section-header'
import type { Space } from '@/lib/spaces/types'

// MEMBERSHIPS section BODY (extracted from memberships/page.tsx so the unified Offerings surface can
// compose it as one stacked section). The route + auth gate stays on the caller (the Offerings page).
// The WRITE action (setMembershipTiers, behind MembershipTierForm) is unchanged and stays the source
// of truth (canEditProfile server-side). This component re-checks the memberships function gate and
// loads the same data the page always loaded.
//
// HONESTY (CONTENT-VOICE skeptic test): v1 takes no payment. No em/en dashes.

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
        <p className="mb-3 text-sm text-muted">
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
        <p className="mb-3 text-sm text-muted">
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
    <div className="space-y-px rounded-2xl border border-border bg-surface p-2 lift-1">
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
