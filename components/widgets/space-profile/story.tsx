import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceAboutBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// STORY — the space's longer narrative card. Reads the central story body off the data bag
// (profileData.about, stored in the preferences blob); FAIL-SAFE: no story, no card (the reused block
// returns null on an empty body). The SHORT intro is the separate `about` block.
export function StoryBlock({ data }: { space: SpaceProfileContext; data: SpaceContentData }) {
  const body = data.profile?.about
  if (!body) return null
  return (
    <ModuleSection anchor="story">
      <SpaceAboutBlock eyebrow="About" heading="Our story" body={body} />
    </ModuleSection>
  )
}
