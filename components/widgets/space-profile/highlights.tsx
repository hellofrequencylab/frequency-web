import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceHighlightsBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// HIGHLIGHTS — the calm live-count strip (members / offerings / ...). Reads the resolved positive
// counts off the data bag; FAIL-SAFE: an empty set renders nothing (honest at day zero).
export function HighlightsBlock({ data }: { space: SpaceProfileContext; data: SpaceContentData }) {
  const highlights = data.highlights ?? []
  if (highlights.length === 0) return null
  return (
    <ModuleSection anchor="highlights">
      <SpaceHighlightsBlock highlights={highlights} />
    </ModuleSection>
  )
}
