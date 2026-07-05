import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceAboutBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// ABOUT — the space's short intro card. Reads the SHORT about off the data bag (the `spaces.about`
// COLUMN, threaded as data.aboutShort); FAIL-SAFE: no intro, no card (the reused block returns null on
// an empty body). The longer narrative is the separate `story` block (profileData.about).
export function AboutBlock({ data }: { space: SpaceProfileContext; data: SpaceContentData }) {
  const body = data.aboutShort
  if (!body) return null
  return (
    <ModuleSection anchor="about">
      <SpaceAboutBlock eyebrow="About" heading="About this space" body={body} />
    </ModuleSection>
  )
}
