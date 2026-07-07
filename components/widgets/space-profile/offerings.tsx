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
// TODO(services-marketplace): the community marketplace aggregates these LISTED services across every
// space into a single cross-space browse surface. That needs a new cross-space read (a query over all
// spaces' preferences.profileData.offerings filtered to isServiceListed) plus a new public route; it is
// a documented follow-up, not built here. This per-space storefront is the read model it will reuse.
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
  // The picker (ADR-572 item 5) narrows to the featured offerings, in the operator's chosen order; an empty
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
