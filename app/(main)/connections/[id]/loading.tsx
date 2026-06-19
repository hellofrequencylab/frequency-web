import { Skeleton } from '@/components/ui/skeleton'

// Instant full-bleed loading for a Contact (connection) detail page. Tapping a
// contact card is an App Router navigation; without this the feed/list behind it
// stayed visible during the RSC fetch and flashed before the contact loaded.
// This paints the DetailTemplate's shape (avatar + name band, then body) the
// moment navigation starts so the destination covers the feed immediately.
export default function ContactDetailLoading() {
  return (
    <div>
      {/* Back link */}
      <Skeleton className="mb-2 h-4 w-20" />

      {/* Identity band: avatar + name + role/company subtitle */}
      <div className="pb-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
      </div>

      {/* Header hairline */}
      <div className="border-t border-border" />

      {/* Body: contact fields + notes */}
      <div className="mt-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-48" />
          </div>
        ))}
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  )
}
