import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for Search (PAGE-FRAMEWORK §5).
//
// It used to open with `px-4 py-8 max-w-2xl mx-auto` — the RETIRED page shell. The app shell's
// <main> already supplies the outer padding (px-4 sm:px-6 lg:px-8 on the content column, py-6 on
// <main>), so that wrapper double-padded, and `max-w-2xl` painted a column narrower than the
// IndexTemplate page.tsx actually renders. The skeleton now paints the template's own shape:
// PageHeading's title + description, its divider rule, the toolbar row, then the result rows.
export default function SearchLoading() {
  return (
    <div>
      <div className="mb-4 space-y-2 sm:mb-5">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="mb-6 mt-4 flex gap-1 border-b border-border pb-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5">
            <Skeleton className="w-9 h-9 rounded-pill shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-1.5" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
