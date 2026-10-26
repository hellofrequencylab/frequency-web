import { FqCircleLoading } from '@/components/frequency/members/community-states'

// Instant loading state for ONE circle. Opening a circle card is an App Router navigation, and
// until this file existed the nearest boundary above it was app/(main)/circles/loading.tsx — the
// INDEX skeleton. So tapping a circle painted a list of card-shaped rows and then replaced them
// with a detail page: the wrong shape, promising the wrong thing, for the whole RSC round trip.
//
// It sits at the [slug] level, ABOVE the (circle) route group, on purpose. A loading.tsx nested in
// the same folder as a layout is rendered INSIDE that layout (Next 16, loading.js "Behavior"), so a
// file inside (circle)/ could only ever cover the tab bodies and would still leave the shell's own
// header unpainted on a cold open. This one covers the shell too, and it also serves the circle's
// owner routes (manage / crm / settings / edit), which are siblings of the group and were falling
// back to the same index skeleton.
//
// The shape mirrors what actually lands (app/(main)/circles/[slug]/(circle)/layout.tsx composing
// DetailTemplate): the 16:6 cover, the identity lockup with its action cluster pushed right, the
// badge row, then the tab strip and a body. Skeletons are dimension-matched so nothing jumps when
// the real header swaps in (PAGE-FRAMEWORK §5.4).
export default function CircleDetailLoading() {
  return <FqCircleLoading />
}
