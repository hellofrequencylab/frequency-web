import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { isServiceListed } from '@/lib/spaces/profile-data'
import { resolvePickedIds } from '@/lib/entity-blocks/block-content'
import { SpaceOfferingsBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// OFFERINGS — the storefront of services this space provides, as a card grid with price + duration.
// Reads the central offerings catalog off the data bag (profileData.offerings) and renders only the
// LISTED services (private ones are direct-link only). FAIL-SAFE: no listed services, no section.
//
// RESOLVED (ADR-593): the cross-space services marketplace shipped. The JSON offerings were backfilled
// into commerce_products (migration 20261101000000), the umbrella aggregates them via
// lib/commerce/products.ts listMarketListings (the Services rail at /market), and each Space's public
// storefront is the /spaces/[slug]/shop tab (Phase 6, reads listPublicSpaceCatalog). FOLLOW-ON: this
// legacy JSON widget still reads profileData.offerings; re-point it to commerce (or retire the block)
// and drop the JSON node once the Shop tab fully supersedes this profile section.
export function OfferingsBlock({
  data,
  header,
  featuredIds,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  header?: { eyebrow?: string; heading?: string }
  featuredIds?: string[]
}) {
  const listed = (data.profile?.offerings ?? []).filter(isServiceListed)
  // The picker (ADR-573 item 5) narrows to the featured offerings, in the operator's chosen order; an empty
  // selection shows every listed offering (item 7). The picker keys an offering by its title, so intersect on
  // title (resolvePickedIds drops any stale id and falls back to all).
  const picked = resolvePickedIds(featuredIds ?? [], listed.map((o) => o.title ?? ''))
  const byTitle = new Map(listed.map((o) => [o.title ?? '', o]))
  const items = picked.map((t) => byTitle.get(t)).filter((o): o is (typeof listed)[number] => Boolean(o))
  if (items.length === 0) return null
  return (
    <ModuleSection anchor="offerings">
      <SpaceOfferingsBlock eyebrow={header?.eyebrow ?? 'Offerings'} heading={header?.heading ?? 'What we offer'} items={items} />
    </ModuleSection>
  )
}
