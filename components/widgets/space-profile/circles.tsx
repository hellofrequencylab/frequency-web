import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { resolvePickedIds } from '@/lib/entity-blocks/block-content'
import { SpaceCommunityBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// CIRCLES — the space's live active community circles. Reads the list off the data bag;
// FAIL-SAFE: no active circles, no section.
export function CirclesBlock({
  data,
  header,
  featuredIds,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  header?: { eyebrow?: string; heading?: string }
  featuredIds?: string[]
}) {
  const all = data.community ?? []
  // The picker (ADR-573 item 5) features only the chosen circles, in order; empty === show all (item 7).
  const picked = resolvePickedIds(featuredIds ?? [], all.map((c) => c.id))
  const byId = new Map(all.map((c) => [c.id, c]))
  const circles = picked.map((id) => byId.get(id)).filter((c): c is (typeof all)[number] => Boolean(c))
  if (circles.length === 0) return null
  return (
    <ModuleSection anchor="circles">
      <SpaceCommunityBlock eyebrow={header?.eyebrow ?? 'Community'} heading={header?.heading ?? 'Circles'} circles={circles} />
    </ModuleSection>
  )
}
