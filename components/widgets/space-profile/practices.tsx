import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpacePracticesBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// PRACTICES AND JOURNEYS — the space's live practices + journeys. Reads both groups off the data bag;
// FAIL-SAFE: neither group has rows, no section.
export function PracticesBlock({
  data,
  header,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  header?: { eyebrow?: string; heading?: string }
}) {
  const practices = data.practices
  if (!practices || (practices.practices.length === 0 && practices.journeys.length === 0)) return null
  return (
    <ModuleSection anchor="practices">
      <SpacePracticesBlock
        eyebrow={header?.eyebrow ?? 'Start here'}
        heading={header?.heading ?? 'Practices and journeys'}
        practicesHeading="Practices to start"
        journeysHeading="Journeys to begin"
        data={practices}
      />
    </ModuleSection>
  )
}
