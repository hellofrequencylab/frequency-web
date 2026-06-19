import { Skeleton } from '@/components/ui/skeleton'

// Instant full-bleed loading for the event-poster capture flow. The Zap menu's
// Event tile navigates here; without this the feed behind stayed visible during
// the RSC fetch and flashed before the capture screen loaded. This paints the
// FocusTemplate's shape immediately (matches the page's `default` width) so the
// destination covers the feed the instant navigation starts.
export default function ScanPosterLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Back link + heading band */}
      <div className="space-y-2 pb-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>

      {/* Capture dropzone */}
      <Skeleton className="h-44 w-full rounded-2xl" />

      {/* Action row */}
      <div className="mt-3 flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-24 rounded-xl" />
      </div>
    </div>
  )
}
