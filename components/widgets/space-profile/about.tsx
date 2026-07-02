import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceAboutBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// ABOUT — the space's story card. Reads the central About body off the data bag (profileData.about);
// FAIL-SAFE: no story, no card (the reused block returns null on an empty body).
export function AboutBlock({ data }: { space: SpaceProfileContext; data: SpaceContentData }) {
  const body = data.profile?.about
  if (!body) return null
  return (
    <ModuleSection anchor="about">
      <SpaceAboutBlock eyebrow="About" heading="Our story" body={body} />
    </ModuleSection>
  )
}
