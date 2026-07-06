import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceUpdatesBlock } from '@/components/page-editor/blocks/spaces'
import { ModuleSection } from './section'

// UPDATES — the brand's recent posts feed (latest few). Reads the live rows off the data bag;
// FAIL-SAFE: no published updates, no section.
export function UpdatesBlock({
  data,
  header,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  header?: { eyebrow?: string; heading?: string }
}) {
  if (data.updates.length === 0) return null
  return (
    <ModuleSection anchor="updates">
      <SpaceUpdatesBlock eyebrow={header?.eyebrow ?? 'Latest'} heading={header?.heading ?? 'From the team'} updates={data.updates} limit={3} />
    </ModuleSection>
  )
}
