import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { isServiceListed } from '@/lib/spaces/profile-data'
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
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  header?: { eyebrow?: string; heading?: string }
}) {
  const items = (data.profile?.offerings ?? []).filter(isServiceListed)
  if (items.length === 0) return null
  return (
    <ModuleSection anchor="offerings">
      <SpaceOfferingsBlock eyebrow={header?.eyebrow ?? 'Offerings'} heading={header?.heading ?? 'What we offer'} items={items} />
    </ModuleSection>
  )
}
