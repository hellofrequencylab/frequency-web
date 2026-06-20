import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for the Community directory (PAGE-FRAMEWORK §5). The
// layout withholds the hub tab strip on the bare /network index, so the page
// owns its chrome: header, the inline tabs + counts rule, the filter row, then
// the two-column body (2/3 contact cards, 1/3 rail). This mirrors that shape so
// the directory paints immediately while the member query streams (no shift).
function ContactCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <Skeleton className="mx-auto h-16 w-16 rounded-full" />
      <Skeleton className="mx-auto mt-3 h-4 w-24" />
      <Skeleton className="mx-auto mt-1.5 h-3 w-16" />
    </div>
  )
}

export default function NetworkLoading() {
  return (
    <div>
      {/* Header band (PageHeading: title + description + Invite action) */}
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <Skeleton className="h-9 w-28 shrink-0 rounded-lg" />
      </div>

      {/* Inline tabs + community counts, sharing the header rule */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-border">
        <div className="flex items-center gap-4 pb-2.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="mb-2.5 h-4 w-40" />
      </div>

      {/* Filter row */}
      <div className="mt-5 space-y-3">
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>

      {/* Two-column body: 2/3 contact grid, 1/3 rail */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:col-span-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <ContactCardSkeleton key={i} />
          ))}
        </div>
        <aside className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </aside>
      </div>
    </div>
  )
}
