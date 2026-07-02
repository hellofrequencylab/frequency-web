import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceCommunityBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// CIRCLES — the space's live active community circles. Reads the list off the data bag;
// FAIL-SAFE: no active circles, no section.
export function CirclesBlock({ data }: { space: SpaceProfileContext; data: SpaceContentData }) {
  const circles = data.community ?? []
  if (circles.length === 0) return null
  return (
    <ModuleSection anchor="circles">
      <SpaceCommunityBlock eyebrow="Community" heading="Circles" circles={circles} />
    </ModuleSection>
  )
}
