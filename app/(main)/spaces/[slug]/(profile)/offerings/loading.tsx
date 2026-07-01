import { ProfileBodySkeleton } from '@/components/spaces/profile-body-skeleton'

// Route-level loading UI for the profile's Offerings tab (PAGE-FRAMEWORK §5.4, ENTITY-SPACES §A.5).
// The shared hero card + tab row live in the layout (which stays mounted across tab nav), so this
// fallback covers only the tab BODY: card-shaped placeholders at the directory GridSkeleton fidelity
// while the Space's offerings stream in, so navigating to this tab paints progressively, not blank.
export default function Loading() {
  return <ProfileBodySkeleton />
}
