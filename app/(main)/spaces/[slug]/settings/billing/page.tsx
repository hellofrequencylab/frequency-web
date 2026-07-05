import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { BillingBody } from './billing-body'

// SPACE PLAN AND BILLING (Pricing P3, ADR-363/364). The owner-facing space plan ladder. This page owns the
// ROUTE + AUTH gate once (resolveSpaceManageAccess, notFound on a miss so there is no existence leak), then
// wraps the chrome-free <BillingBody> in the FocusTemplate. The same body ALSO renders inline in the Space
// profile as the Plan and usage `?panel=` workspace (Stage D2). The FeatureLockedNotice vs full ladder
// branch (and every pricing read) lives inside BillingBody; this page only picks the matching template
// chrome (a locked Space keeps the plain, non-wide "Plan and billing" framing; the unlocked hub reads as
// "Plan and usage") so the standalone render is byte-identical.
//
// The buy CTA is GATED: spacePlanSellable() = billingLive() AND the per-plan switch, both false while
// billing is OFF. White-label is NOT a self-serve checkout: it is the deliberately-expensive door sold
// high-touch (network-effect strategy, ADR-364). Gated RENDER on canManage || staffViewing (404 otherwise,
// no existence leak); the WRITE actions re-gate on canManage server-side. No em dashes (CONTENT-VOICE §10).

export const metadata = {
  title: 'Plan and usage',
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

  // Pick the FocusTemplate chrome to match BillingBody's own branch (kept identical to before): a
  // feature-locked Space (billing role-gated for a non-staff viewer) reads with the plain "Plan and
  // billing" framing + short description; otherwise the wide "Plan and usage" hub framing. BillingBody
  // re-derives this same condition to render the matching body, so the two never diverge.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  const featureLocked = !staffViewing && !spaceFunctionAccess(space, 'billing', caps.role)

  if (featureLocked) {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="Plan and billing"
        description="The plan and billing for this space."
      >
        <BillingBody slug={slug} />
      </FocusTemplate>
    )
  }

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Plan and usage"
      description="See your current plan and how much of each tool you are using. Every tool is available on every plan. You pay to use more as you grow, never to unlock."
      width="wide"
    >
      <BillingBody slug={slug} />
    </FocusTemplate>
  )
}
