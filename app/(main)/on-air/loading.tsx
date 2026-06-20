import { Skeleton } from '@/components/ui/skeleton'

// Route-level loading UI for On Air / Mindless (PAGE-FRAMEWORK §5). The route is
// a no-rail Focus surface (page-chrome 'none'); this paints the centered, narrow
// FocusTemplate shape (eyebrow + title + description over a body card) while the
// member's adopted practices and remembered setup load, so the surface holds its
// place instead of flashing blank before the session mounts (no layout shift).
export default function OnAirLoading() {
  return (
    <div className="mx-auto w-full max-w-lg">
      {/* Header band (PageHeading without divider: eyebrow + title + description) */}
      <div className="mb-4 space-y-2 sm:mb-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>

      {/* Body card */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <Skeleton className="mx-auto h-4 w-44" />
        <Skeleton className="mx-auto mt-3 h-4 w-56 max-w-full" />
        <Skeleton className="mx-auto mt-5 h-9 w-36 rounded-lg" />
      </div>
    </div>
  )
}
