import { Skeleton } from '@/components/ui/skeleton'

// Instant full-bleed loading for the personal codes / QR hub. The Zap menu's
// Connect tile ("Share your code") navigates here; without this the feed behind
// stayed visible during the RSC fetch and flashed before the codes loaded. This
// paints the FocusTemplate's shape immediately (matches the page's `wide` width)
// so the destination covers the feed the instant navigation starts.
export default function CodesLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Heading band */}
      <div className="space-y-2 pb-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>

      {/* Code cards: a QR tile over its title + scan count */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface p-4">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <Skeleton className="mt-3 h-4 w-24" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        ))}
      </div>

      {/* vCard editor block */}
      <Skeleton className="mt-6 h-40 w-full rounded-2xl" />
    </div>
  )
}
