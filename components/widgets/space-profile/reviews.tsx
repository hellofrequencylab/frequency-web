import { Star } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { ModuleSection } from './section'

// REVIEWS — the ratings and reviews section is OFF for now, shown as coming soon (owner decision).
// It never reads or displays real ratings (`data.reviews`) and never surfaces a "leave a review"
// affordance; it renders a subtle, on-brand coming-soon card in the ratings slot so the section reads
// as intentional, not broken. When ratings ship, this block reads the live summary again. Takes no
// props by design (it must not touch the reviews data); it stays assignable to the module block type.
export function ReviewsBlock() {
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
