import { Skeleton } from '@/components/ui/skeleton'

// Instant full-bleed loading for the New profile (contact) creator. The Zap
// menu's Contact tile and the "New profile" action are App Router navigations;
// without this the feed behind stayed visible during the RSC fetch and flashed
// before the creator loaded. This paints the FocusTemplate's shape immediately
// (matches the page's `default` width) so the destination covers the feed at the
// instant navigation starts.
export default function NewProfileLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Back link + heading band */}
      <div className="space-y-2 pb-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>

      {/* Scan / Manual tab bar */}
      <Skeleton className="h-12 w-full rounded-xl" />

      {/* Capture dropzone */}
      <Skeleton className="mt-5 h-40 w-full rounded-2xl" />

      {/* Action row */}
      <div className="mt-3 flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-24 rounded-xl" />
      </div>
    </div>
  )
}
