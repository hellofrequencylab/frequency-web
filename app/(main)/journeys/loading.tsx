import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for the Journeys index (PAGE-FRAMEWORK §5). Mirrors the
// IndexTemplate header + the module-driven body (constrained to max-w-4xl, as the
// page is), so the page paints its real shape immediately instead of flashing
// blank while the blocks stream (no layout shift).
function JourneyCardSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  )
}

export default function JourneysLoading() {
  return (
    <div>
      {/* Header band (PageHeading: title + description + rule) */}
      <div className="mb-4 space-y-2 sm:mb-5">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="mb-5 border-b border-border sm:mb-6" />

      {/* Module-driven body */}
      <div className="max-w-4xl space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <JourneyCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
