import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { resolvePickedIds } from '@/lib/entity-blocks/block-content'
import { SpacePracticesBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// JOURNEYS (ADR-542) — the journeys this space HOSTS, auto-pulled from the same reader the Practices block
// uses (data.practices.journeys). This is the free-form "Journeys" block a space can drop on its page: it
// shows only the journeys group (the Practices block still shows both). FAIL-SAFE: no hosted journeys, no
// section, so a space that hosts none simply renders nothing.
export function JourneysBlock({
  data,
  header,
  featuredIds,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  header?: { eyebrow?: string; heading?: string }
  featuredIds?: string[]
}) {
  const all = data.practices?.journeys ?? []
  // The picker (ADR-572 item 5) features only the chosen journeys, in order; empty === show all (item 7).
  const picked = resolvePickedIds(featuredIds ?? [], all.map((j) => j.id))
  const byId = new Map(all.map((j) => [j.id, j]))
  const journeys = picked.map((id) => byId.get(id)).filter((j): j is (typeof all)[number] => Boolean(j))
  if (journeys.length === 0) return null
  return (
    <ModuleSection anchor="journeys">
      <SpacePracticesBlock
        eyebrow={header?.eyebrow ?? 'Begin a journey'}
        heading={header?.heading ?? 'Journeys'}
        journeysHeading=""
        data={{ practices: [], journeys }}
      />
    </ModuleSection>
  )
}
