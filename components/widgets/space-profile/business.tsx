import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceBusinessBlock } from '@/components/page-editor/blocks/profile'
import { ModuleSection } from './section'

// BUSINESS PRESENCE — the space's social / business links + an optional operator-entered rating, as a
// LinkedIn/Yelp-style strip. Reads the central profile data off the data bag; FAIL-SAFE: with no links
// and no rating the reused block renders nothing.
export function BusinessBlock({ data }: { space: SpaceProfileContext; data: SpaceContentData }) {
  const p = data.profile
  const links = p?.socials ?? []
  const hasRating = !!p?.rating
  if (links.length === 0 && !hasRating) return null
  return (
    <ModuleSection anchor="business">
      <SpaceBusinessBlock
        heading="Find us online"
        rating={p?.rating}
        ratingCount={p?.ratingCount}
        links={links}
      />
    </ModuleSection>
  )
}
