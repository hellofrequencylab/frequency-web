import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { resolveSpacePayoutPrompt } from '@/lib/billing/payout-prompt-resolve'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { ServiceSpark } from './service-spark'
import { spaceCanTakePayments } from '@/lib/pricing/payments-gate'
import { loadUpgradeOffer } from '@/lib/pricing/business-offer'
import type { UpgradeMomentSetup } from '@/components/pricing/upgrade-moment'

// Add a bookable service to a Space (ADR-596 · docs/STUDIO.md §0, ADR-986). The guided way in to the
// Shop console's catalog: the Service SPARK, whose fields all come from SERVICE_MANIFEST.
//
// THE GATE IS THE SHOP CONSOLE'S GATE, in the same order, because it is the same authority: manage
// access, a Business-account space type, and the `shop` function switched on for that role. A staff
// previewer is READ ONLY on the console, so they are denied here rather than shown a create form they
// cannot submit. `createSpaceProductAction` re-checks all three server-side regardless (server actions
// are addressable on their own), so this render gate is convenience, not the boundary.
//
// GETTING PAID IS OFFERED HERE (LIVE-538, ADR-1539): this is where a bookable service gets its price,
// its price model and its deposit, so it is the Space's first sell attempt for bookings. The page
// resolves the one Connect prompt for the SPACE payee (the owner is who Stripe pays, ADR-819, so an
// editor reads who has to act instead of being handed a button for the wrong account) and the Spark
// renders its card on the first screen. Null once the owner is ready (ADR-1158).

export const metadata = { title: 'New service' }

export default async function NewSpaceServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage } = await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
  if (!canManage) notFound()
  if (!isConsoleSpaceType(space.type)) notFound()
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!spaceFunctionAccess(space, 'shop', caps.role)) notFound()

  const payoutPrompt = await resolveSpacePayoutPrompt({
    space,
    viewerProfileId,
    channels: ['bookings'],
  })

  // A free Space lists the service, but a price on it is not charged until Business (LIVE-753): the
  // Spark shows the upgrade moment when one is set (LIVE-758).
  const upgrade: UpgradeMomentSetup | undefined = (await spaceCanTakePayments(space.id, { plan: space.plan ?? null }))
    ? undefined
    : {
        target: { spaceSlug: slug, canUpgrade: !!viewerProfileId && space.ownerProfileId === viewerProfileId },
        offer: await loadUpgradeOffer(),
      }

  return (
    <ServiceSpark
      slug={slug}
      spaceId={space.id}
      spaceName={space.brandName ?? space.name}
      payoutPrompt={payoutPrompt}
      upgrade={upgrade}
    />
  )
}
