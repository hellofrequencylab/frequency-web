import { Skeleton } from '@/components/ui/skeleton'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FqUtilityLoading } from '@/components/frequency/members/utility-states'

// Route-level loading skeleton for My Orders. The page is force-dynamic and awaits the buyer's
// order + dispute reads before first paint; this renders instantly during those awaits so the
// post-checkout landing is never a blank screen. Mirrors the OrderCard shape.
function OrderCardSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface p-4 lift-1">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-16 rounded-pill" />
      </div>
      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
    </div>
  )
}

export default function OrdersLoading() {
  // Under Frequency (build-time) the wait is the kit's own head and pending rows (utility-states.tsx).
  if (SITE_DESIGN === 'frequency') return <FqUtilityLoading title="My orders" label="Loading your orders" />
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <OrderCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
