import { Skeleton } from '@/components/ui/skeleton'

// Instant loading state for a TAB BODY. A loading.tsx in the same folder as a layout renders inside
// it (Next 16, loading.js "Behavior"), so this one covers only what changes when you move between
// Feed, Events, Journey, Practice and Members: the header, the badges and the tab strip above stay
// painted and interactive, and the body underneath swaps.
//
// That is the point of putting the tabs in a route-segment layout at all (PAGE-FRAMEWORK §5.6,
// partial rendering). Without this file, a tab whose data is slow leaves the previous tab's body on
// screen while the strip already shows the new tab as current, which reads as a click that did
// nothing. The cold-open skeleton for the whole shell is one level up, at [slug]/loading.tsx.
export default function CircleTabLoading() {
  return (
    <div className="space-y-3 pt-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-24 w-full rounded-card" />
      <Skeleton className="h-24 w-full rounded-card" />
    </div>
  )
}
