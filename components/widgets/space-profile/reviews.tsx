import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { SpaceReviewsBlock } from '@/components/page-editor/blocks/spaces'
import { ModuleSection } from './section'

// REVIEWS — member reviews: average + latest few. Reads the live summary off the data bag;
// FAIL-SAFE: no visible reviews, no section (never a fabricated average).
export function ReviewsBlock({ data }: { space: SpaceProfileContext; data: SpaceContentData }) {
  if (data.reviews.count === 0) return null
  return (
    <ModuleSection anchor="reviews">
      <SpaceReviewsBlock eyebrow="What members say" heading="Reviews" reviews={data.reviews} limit={4} />
    </ModuleSection>
  )
}
