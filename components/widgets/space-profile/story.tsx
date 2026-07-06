import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceAboutBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// STORY — the space's longer narrative card. The owner's inline-authored `body` (ADR-542, written in the
// page builder) takes precedence; it FALLS BACK to the central story body off the data bag (profileData.about,
// stored in the preferences blob). FAIL-SAFE: no story, no card (the reused block returns null on an empty
// body). The SHORT intro is the separate `about` block.
export function StoryBlock({
  data,
  header,
  authoredBody,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  /** The owner's authored eyebrow/title override (undefined = keep the default). */
  header?: { eyebrow?: string; heading?: string }
  /** The owner's inline-authored Story text (from the block's content bag); precedence over the data bag. */
  authoredBody?: string
}) {
  const body = authoredBody?.trim() || data.profile?.about
  if (!body) return null
  return (
    <ModuleSection anchor="story">
      <SpaceAboutBlock eyebrow={header?.eyebrow ?? 'About'} heading={header?.heading ?? 'Our story'} body={body} />
    </ModuleSection>
  )
}
