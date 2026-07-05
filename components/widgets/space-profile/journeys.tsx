import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpacePracticesBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// JOURNEYS (ADR-542) — the journeys this space HOSTS, auto-pulled from the same reader the Practices block
// uses (data.practices.journeys). This is the free-form "Journeys" block a space can drop on its page: it
// shows only the journeys group (the Practices block still shows both). FAIL-SAFE: no hosted journeys, no
// section, so a space that hosts none simply renders nothing.
export function JourneysBlock({ data }: { space: SpaceProfileContext; data: SpaceContentData }) {
  const journeys = data.practices?.journeys ?? []
  if (journeys.length === 0) return null
  return (
    <ModuleSection anchor="journeys">
      <SpacePracticesBlock
        eyebrow="Begin a journey"
        heading="Journeys"
        journeysHeading=""
        data={{ practices: [], journeys }}
      />
    </ModuleSection>
  )
}
