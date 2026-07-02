import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceOfferingsBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// OFFERINGS — the services this space provides, as a card grid. Reads the central offerings catalog
// off the data bag (profileData.offerings); FAIL-SAFE: no offerings, no section.
export function OfferingsBlock({ data }: { space: SpaceProfileContext; data: SpaceContentData }) {
  const items = data.profile?.offerings ?? []
  if (items.length === 0) return null
  return (
    <ModuleSection anchor="offerings">
      <SpaceOfferingsBlock eyebrow="Offerings" heading="What we offer" items={items} />
    </ModuleSection>
  )
}
