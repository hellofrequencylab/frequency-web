import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'

// Route-level loading UI for the profile's community tab (PAGE-FRAMEWORK §5.4, ENTITY-SPACES §A.5). The
// shared hero card + tab row live in the layout (mounted across tab nav), so this covers only the
// tab BODY: card-shaped placeholders while the Space's content streams in, so the tab paints
// progressively instead of flashing empty.
export default function Loading() {
  return <ProfileBodySkeleton />
}
