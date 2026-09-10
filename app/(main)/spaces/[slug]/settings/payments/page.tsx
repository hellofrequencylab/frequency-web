import { notFound } from 'next/navigation'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { PaymentsBody } from './payments-body'

// GET PAID (LIVE-294, ADR-1313). The operator's payout home: where the money lands, which of the five
// money paths are live, the rate actually in effect, and one line separating what the space RECEIVES
// from what it PAYS.
//
// FocusTemplate, not Dashboard. PAGE-FRAMEWORK §8.1 gives Focus "a centered single-task body: compose,
// edit, settings", and §8.3 is explicit that a settings surface takes it. Dashboard is for a metric-led
// workspace, which the Shop console earns because it owns real KPI tiles; this page owns no numbers of
// its own (earnings live in Shop, plan spend in Billing). Four status bands are not a stats strip.
//
// UNGATED on purpose — `gate: { kind: 'always' }, featureKey: null` on its catalog row, the same shape
// `space.reachreceipt` carries and for the same reason: this page exists to repair the payout dead end
// (lib/billing/payout-prompt.ts opens with why nothing has ever been charged on this platform), so a
// switch that could hide it would recreate the thing it fixes. There is no configuration here to turn
// off, only a reading.
//
// The right rail comes for free: railFor() falls through to 'global' for /spaces/<slug>/settings/*, so
// no page-chrome entry is needed (page-chrome.ts says so at the SCOPED_PREFIXES comment).
//
// Gated RENDER on canManage || staffViewing, notFound() on a miss so there is no existence leak. No em
// dashes (CONTENT-VOICE §10).

export const metadata = {
  title: 'Get paid',
}

export default async function SpacePaymentsPage({
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

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Get paid"
      description="Where your money lands, which of your money paths are live, and what the network takes."
      width="wide"
    >
      <PaymentsBody slug={slug} />
    </FocusTemplate>
  )
}
