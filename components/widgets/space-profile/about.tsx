import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceAboutBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// ABOUT — the space's short intro card. The owner's inline-authored `body` (ADR-542, written in the page
// builder) takes precedence; it FALLS BACK to the SHORT about off the data bag (the `spaces.about` COLUMN,
// threaded as data.aboutShort). FAIL-SAFE: no intro, no card (the reused block returns null on an empty
// body). The longer narrative is the separate `story` block (profileData.about).
export function AboutBlock({
  data,
  header,
  authoredBody,
}: {
  space: SpaceProfileContext
  data: SpaceContentData
  /** The owner's authored eyebrow/title override (undefined = keep the default). */
  header?: { eyebrow?: string; heading?: string }
  /** The owner's inline-authored About text (from the block's content bag); precedence over the data bag. */
  authoredBody?: string
}) {
  const body = authoredBody?.trim() || data.aboutShort
  if (!body) return null
  return (
    <ModuleSection anchor="about">
      <SpaceAboutBlock eyebrow={header?.eyebrow ?? 'About'} heading={header?.heading ?? 'About this space'} body={body} />
    </ModuleSection>
  )
}
