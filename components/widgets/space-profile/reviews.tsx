import { Star } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { ModuleSection } from './section'

// REVIEWS / RATINGS (ADR-529 item 3). The operator-entered rating moved here from the Business block, so
// "Find us online" is links-only and the rating stands on its own. When the operator has set a rating it
// renders a compact rating card; otherwise it stays the on-brand "coming soon" card (member reviews are
// still off, owner decision). FAIL-SAFE: reads the central profile data, renders nothing broken.
export function ReviewsBlock({ data }: { space: SpaceProfileContext; data: SpaceContentData }) {
  // The operator-entered rating is a display string, e.g. "4.8" (+ an optional "126 reviews" count).
  const ratingStr = data.profile?.rating?.trim()
  const count = data.profile?.ratingCount?.trim()
  const ratingNum = ratingStr ? Number.parseFloat(ratingStr) : NaN

  if (ratingStr && Number.isFinite(ratingNum) && ratingNum > 0) {
    const rounded = Math.round(ratingNum)
    return (
      <ModuleSection anchor="reviews">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold text-text">{ratingStr}</span>
            <span className="flex" aria-hidden>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-5 w-5 ${i < rounded ? 'fill-primary text-primary' : 'text-border'}`}
                />
              ))}
            </span>
          </div>
          {count && <p className="mt-2 text-sm text-muted">{count}</p>}
        </div>
      </ModuleSection>
    )
  }

  return (
    <ModuleSection anchor="reviews">
      <EmptyState
        icon={Star}
        title="Ratings, coming soon"
        description="Ratings and reviews are on the way. Check back soon to see what members say."
      />
    </ModuleSection>
  )
}
