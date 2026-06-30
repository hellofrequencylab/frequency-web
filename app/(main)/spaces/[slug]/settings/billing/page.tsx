import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { spaceManageHref } from '@/lib/spaces/types'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { getPricingValues } from '@/lib/pricing/settings'
import { spacePlanSellable } from '@/lib/billing/space-plan-checkout'
import { spacePlanRows } from '@/lib/pricing/display'
import { asSpacePlan, planEntitlementKeys, SPACE_PLAN_LABEL } from '@/lib/pricing/plans'
import { SpacePlanPicker } from './plan-picker'
import { WhitelabelRequest } from './whitelabel-request'

// SPACE PLAN AND BILLING (Pricing P3, ADR-363/364). The owner-facing space plan ladder. It shows the
// current plan, the four paid plans with their OPERATOR-SET prices (getPricingValues(), never
// hardcoded), and what each unlocks. The buy CTA is GATED: spacePlanSellable() = billingLive() AND
// the per-plan switch, both false while billing is OFF, so the ladder renders with the current plan +
// DISABLED "coming soon" CTAs and nothing fires a checkout. When billing goes live the CTA becomes a
// real Stripe Checkout (createSpacePlanCheckout via the plan picker action).
//
// White-label is NOT a self-serve checkout: it is the deliberately-expensive door sold high-touch
// (network-effect strategy, ADR-364), so it gets a "Request white-label" LEAD surface instead.
//
// Gated RENDER on canManage || staffViewing (404 otherwise, no existence leak); the WRITE actions
// re-gate on canManage server-side. No em dashes (CONTENT-VOICE §10).

export const metadata = {
  title: 'Plan and billing',
}

export default async function SpaceBillingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). Plan and billing default to ADMIN (money is an
  // admin tool), reproducing the intended threshold. A staff janitor keeps the read-only preview (the
  // picker is already fieldset-disabled for them; every write stays gated server-side).
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'billing', caps.role)) {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="Plan and billing"
        description="The plan and billing for this space."
        back={{ href: spaceManageHref(space.type, space.slug), label: `Manage ${brandName}` }}
      >
        <FeatureLockedNotice
          brandName={brandName}
          slug={space.slug}
          type={space.type}
          label="Plan and billing"
          reason={spaceFunctionAccess(space, 'billing', 'admin') ? 'role' : 'disabled'}
          canManageMembers={caps.canManageMembers}
        />
      </FocusTemplate>
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

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Plan and billing"
      description="Pick the plan that fits what you run here. Each plan unlocks more tools for your space."
      back={{ href: spaceManageHref(space.type, space.slug), label: `Manage ${brandName}` }}
      width="wide"
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <div className="space-y-8">
        <div className="rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-subtle">Current plan</p>
          <p className="mt-1 text-lg font-bold text-text">{SPACE_PLAN_LABEL[currentPlan]}</p>
        </div>

        <fieldset disabled={staffViewing} className="contents">
          <SpacePlanPicker
            slug={space.slug}
            currentPlan={currentPlan}
            rows={rows}
            sellable={sellable}
            unlocks={unlocks}
          />
        </fieldset>

        {/* White-label: the high-touch door (ADR-364). A lead, never a checkout. */}
        <WhitelabelRequest
          slug={space.slug}
          monthly={rows.find((r) => r.key === 'whitelabel')?.monthly ?? null}
          setup={rows.find((r) => r.key === 'whitelabel')?.setup ?? null}
          isWhitelabel={currentPlan === 'whitelabel'}
          defaultEmail={defaultEmail}
        />
      </div>
    </FocusTemplate>
  )
}
