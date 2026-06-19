import { Skeleton } from '@/components/ui/skeleton'

// Instant full-bleed loading for an Event Invite page. Opening an event card (or
// the Zap menu's Event tile) is an App Router navigation; without this the feed
// underneath stayed visible during the RSC fetch and flashed before the event
// loaded. This paints the DetailTemplate's shape the moment navigation starts so
// the destination covers the feed immediately. Mirrors the destination width
// (the /events/[slug] Invite page owns its full width, no rail).
export default function EventDetailLoading() {
  return (
    <div>
      {/* Back link */}
      <Skeleton className="mb-2 h-4 w-24" />

      {/* Identity band: title + subtitle */}
      <div className="space-y-2 pb-4">
        <Skeleton className="h-7 w-2/3" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>

      {/* Header hairline */}
      <div className="border-t border-border" />

      {/* Two-column interior: wide body + sticky Join aside (EVENTS-DESIGN §1) */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* When / where meta rows */}
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
          {/* Description body */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        {/* Join / RSVP aside */}
        <aside>
          <Skeleton className="h-48 w-full rounded-2xl" />
        </aside>
      </div>
    </div>
  )
}
