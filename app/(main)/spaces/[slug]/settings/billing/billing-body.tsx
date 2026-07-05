import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities, spaceHasEntitlement } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { getPricingValues, billingLive } from '@/lib/pricing/settings'
import { loadCatalogConfig } from '@/lib/pricing/catalog-config'
import { spacePlanSellable, spaceLoadoutSellable } from '@/lib/billing/space-plan-checkout'
import { readLockedPriceId } from '@/lib/billing/space-subscription-items'
import { addonKeyForCatalogItem } from '@/lib/billing/pricing-keys'
import { spacePlanRows } from '@/lib/pricing/display'
import { asSpacePlan, planEntitlementKeys, addonsHeldBy, SPACE_PLAN_LABEL } from '@/lib/pricing/plans'
import { getSeatUsage } from '@/lib/spaces/seats'
import { SeatCounter } from '@/components/spaces/seat-counter'
import { SpacePlanPicker } from './plan-picker'
import { SpaceLoadoutPicker } from './loadout-picker'
import { WhitelabelRequest } from './whitelabel-request'
import { SectionHeader } from '@/components/ui/section-header'
import { FeatureMeterRange } from '@/components/pricing/feature-meter-range'
import { FEATURE_METERS } from '@/lib/pricing/feature-meters'

// BILLING BODY — the chrome-free plan-and-usage hub, lifted out of the standalone /settings/billing page
// (Stage D2) so it renders in TWO places from one source: (1) that page, wrapped in its FocusTemplate
// chrome, and (2) INLINE in the Space profile body as the Plan and usage `?panel=` workspace
// (components/spaces/workspace/space-body-panel.tsx). It owns NO page chrome (the caller frames it) and
// SELF-GATES server-side so it is safe to mount anywhere: it returns null when the viewer may not manage
// this Space (the standalone page still 404s via its own gate, so a null here never renders a bare 200).
// When billing is locked for a non-staff viewer it returns the FeatureLockedNotice (the caller keeps the
// plain framing); otherwise the current plan, the usage-meter ladder, seats, and the plan/loadout pickers.
//
// The buy CTA is GATED: spacePlanSellable() = billingLive() AND the per-plan switch, both false while
// billing is OFF, so the ladder renders with the current plan + DISABLED "coming soon" CTAs. White-label
// is never self-serve (a lead flow). STAFF PREVIEW is read-only (the pickers are fieldset-disabled). No em
// dashes (CONTENT-VOICE §10).

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
  // admin tool), reproducing the intended threshold. A staff janitor keeps the read-only preview (the
  // picker is already fieldset-disabled for them; every write stays gated server-side).
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

  // The owner's email, prefilled into the white-label request form (getCallerProfile omits it).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const defaultEmail = user?.email ?? ''

  // The plan lives on spaces.plan (untyped, ADR-246) — read it fail-safe.
  const { data: planRow } = (await createAdminClient()
    .from('spaces')
    .select('plan')
    .eq('id', space.id)
    .maybeSingle()) as { data: { plan?: string | null } | null }
  const currentPlan = asSpacePlan(planRow?.plan)

  const values = await getPricingValues()
  const rows = spacePlanRows(values)

  // Per-plan sellable flags (billingLive() AND the per-plan switch). All false while billing is OFF,
  // so the picker shows disabled "coming soon" CTAs. White-label is never self-serve (lead flow).
  const sellable = Object.fromEntries(
    await Promise.all(
      rows.map(async (r) => [r.key, r.key === 'whitelabel' ? false : await spacePlanSellable(r.key)] as const),
    ),
  ) as Record<string, boolean>

  // What each plan unlocks, for the picker copy (the entitlement keys the plan grants).
  const unlocks = Object.fromEntries(rows.map((r) => [r.key, planEntitlementKeys(asSpacePlan(r.key))])) as Record<string, readonly string[]>

  // PHASE C: the Pro LOADOUT picker (base + add-ons, ADR-463). Reads the operator-set catalog amounts,
  // the loadout-sellable gate (billingLive AND the per-plan switch, FALSE while OFF -> a disabled
  // preview), the trial length, the add-ons the space already holds (pre-selected), and whether the
  // space holds a grandfathered locked base price (its founding rate is held).
  const [catalog, loadoutSellable, lockedBase, seatUsage, billingIsLive] = await Promise.all([
    loadCatalogConfig(),
    spaceLoadoutSellable('pro'),
    readLockedPriceId(space.id, 'base'),
    getSeatUsage(space.id),
    billingLive(),
  ])
  // The Pro base + the four add-on items, with their operator-set amounts (the picker computes the live
  // total from these client-side).
  const loadoutItems = catalog.items.filter(
    (i) => i.key === 'pro_base' || addonKeyForCatalogItem(i.key) !== null,
  )
  const activeAddons = addonsHeldBy((key) => spaceHasEntitlement(space, key))

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
            OFF; reflects the real allowance + enforcement when live. The "add a seat" control is the
            Team add-on in the loadout right below, so this counter is informational here (no link). */}
        <SeatCounter
          usage={seatUsage}
          billingHref={`/spaces/${space.slug}/settings/members`}
          enforced={billingIsLive}
          canManage={false}
        />

        {/* The Pro loadout picker: the base plus the four add-ons, with a live total (ADR-463). A
            disabled preview while billing is OFF; the buy CTA is dormant until live. Staff preview is
            read-only (the fieldset disables it). The Team add-on starts at the seats the space already
            licenses (or the bundled floor), so the picker reflects the current seat count (Phase D). */}
        <fieldset disabled={staffViewing} className="contents">
          <SpaceLoadoutPicker
            slug={space.slug}
            items={loadoutItems}
            addonEnabled={catalog.addonEnabled}
            activeAddons={activeAddons}
            sellable={loadoutSellable}
            trialDays={values.trial.days}
            lockedHeld={lockedBase !== null}
            seatFloor={Math.max(catalog.seat.bundledFloor, seatUsage.seatQuantity)}
          />
        </fieldset>

        {/* Nonprofit and Organization. Their cards check out through the SAME multi-item loadout
            checkout Pro uses (createSpaceLoadoutCheckout), so the picker gives them Pro's monthly/yearly
            toggle, and Nonprofit (a per-seat item) a seat-count control. It reads the catalog amounts +
            the seat floor so the shown price matches what the loadout would charge. */}
        <details className="group rounded-2xl border border-border bg-surface">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-text">
            Nonprofit and Organization plans
            <span className="ml-2 text-2xs font-normal text-subtle group-open:hidden">Show</span>
          </summary>
          <div className="border-t border-border px-5 py-5">
            <fieldset disabled={staffViewing} className="contents">
              <SpacePlanPicker
                slug={space.slug}
                currentPlan={currentPlan}
                rows={rows}
                sellable={sellable}
                unlocks={unlocks}
                catalogItems={catalog.items}
                seatFloor={Math.max(catalog.seat.bundledFloor, seatUsage.seatQuantity)}
              />
            </fieldset>
          </div>
        </details>

        {/* White-label: the high-touch door (ADR-364). A lead, never a checkout. */}
        <WhitelabelRequest
          slug={space.slug}
          monthly={rows.find((r) => r.key === 'whitelabel')?.monthly ?? null}
          setup={rows.find((r) => r.key === 'whitelabel')?.setup ?? null}
          isWhitelabel={spaceHasEntitlement(space, 'whitelabel')}
          defaultEmail={defaultEmail}
        />
      </div>
    </>
  )
}
