import { Suspense } from 'react'
import { getSpaceContentData, type SpaceContentData } from '@/lib/spaces/content-data'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import type { ProfileBlockId } from '@/lib/spaces/profile-blocks'
import { resolveProfileLayout, type SpaceProfileContext } from '@/lib/spaces/profile-modules'

import { AboutBlock } from './about'
import { HighlightsBlock } from './highlights'
import { OfferingsBlock } from './offerings'
import { BookingBlock } from './booking'
import { EventsBlock } from './events'
import { PracticesBlock } from './practices'
import { CirclesBlock } from './circles'
import { TeamBlock } from './team'
import { ReviewsBlock } from './reviews'
import { FaqBlock } from './faq'
import { UpdatesBlock } from './updates'
import { ContactBlock } from './contact'
import { BusinessBlock } from './business'

// THE MODULE-ENGINE SPACE PROFILE RENDERER (Epic 1.7, S2 staff-preview). A non-Puck, block-style
// render of a space profile: it resolves the ordered ProfileBlockId layout from the S1 registry + the
// space's live function set (resolveProfileLayout, pure), fetches every section's live data in ONE
// request-cached pass (getSpaceContentData, no N+1), then renders each block in layout order through a
// static id -> component map. Each section sits in its OWN <Suspense fallback={null}> so a slow section
// never blocks the ones above it (PAGE-FRAMEWORK §5), and each block is FAIL-SAFE (renders nothing when
// its data is absent), so the whole render degrades to an empty column rather than a broken page.
//
// STAFF-PREVIEW ONLY: nothing live reads this yet — the live profile stays the Puck landing
// (components/spaces/space-landing.tsx). This validates the module render beside it.

type BlockComponent = (props: { space: SpaceProfileContext; data: SpaceContentData }) => React.ReactNode

/** The id -> section component map (parity with the S1 PROFILE_BLOCKS registry ids). Adding a section
 *  is one row here + its block file. */
export const SPACE_PROFILE_BLOCKS: Record<ProfileBlockId, BlockComponent> = {
  about: AboutBlock,
  highlights: HighlightsBlock,
  offerings: OfferingsBlock,
  booking: BookingBlock,
  events: EventsBlock,
  practices: PracticesBlock,
  circles: CirclesBlock,
  team: TeamBlock,
  reviews: ReviewsBlock,
  faq: FaqBlock,
  updates: UpdatesBlock,
  contact: ContactBlock,
  business: BusinessBlock,
}

export async function SpaceProfileModules({
  space,
  layout,
}: {
  space: SpaceProfileContext
  /** Override the derived layout (e.g. a saved block-picker order). Omitted = the fresh default. */
  layout?: ProfileBlockId[]
}) {
  const resolved = layout ?? resolveProfileLayout(space)

  // ONE request-cached pass for every section's live data, with the SAME identity/profile inputs the
  // live Puck landing feeds, so the preview shows the operator's real content (not editor placeholders).
  const data = await getSpaceContentData(space.id, {
    name: space.brandName,
    type: space.type,
    logoUrl: space.logoUrl,
    coverUrl: space.coverUrl,
    tagline: space.tagline,
    primaryCta: { label: defaultPrimaryCtaLabel(space.type), href: `/spaces/${space.slug}/book` },
    slug: space.slug,
    profile: space.profile,
  })

  // `@container/profile`: the sections size to THIS slot's width, not the viewport, so the module render
  // drops cleanly into any column (the staff preview body, or a future block-picker canvas).
  return (
    <div className="@container/profile space-y-14">
      {resolved.map((id) => {
        const Block = SPACE_PROFILE_BLOCKS[id]
        if (!Block) return null
        return (
          <Suspense key={id} fallback={null}>
            <Block space={space} data={data} />
          </Suspense>
        )
      })}
    </div>
  )
}
