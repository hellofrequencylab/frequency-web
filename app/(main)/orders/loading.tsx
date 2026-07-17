import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading skeleton for My Orders. The page is force-dynamic and awaits the buyer's
// order + dispute reads before first paint; this renders instantly during those awaits so the
// post-checkout landing is never a blank screen. Mirrors the OrderCard shape.
function OrderCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-16 rounded-full" />
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
