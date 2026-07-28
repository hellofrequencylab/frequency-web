import { Skeleton } from '@/components/ui/skeleton'
import { EventDetailTemplate } from '@/components/templates/event-detail-template'

// Instant full-bleed loading for an Event page. Opening an event card (or the Zap menu's Event tile)
// is an App Router navigation; without this the feed underneath stayed visible during the RSC fetch
// and flashed before the event loaded. This paints the destination's shape the moment navigation
// starts so the event covers the feed immediately.
//
// It composes EventDetailTemplate with skeleton nodes rather than hand-rolling a lookalike. The
// hand-rolled version had already drifted: it painted a 2:1 interior with a plain trailing aside,
// while the live page renders the standard's 3:2 split with the side column stacked FIRST on a
// phone. Composing the template means the skeleton and the destination cannot disagree about the
// shape again.
export default function EventDetailLoading() {
  return (
    <EventDetailTemplate
      cover={<Skeleton className="h-48 w-full rounded-2xl sm:h-64" />}
      title={<Skeleton className="h-9 w-2/3" />}
      identity={{
        when: <Skeleton className="h-5 w-56" />,
        where: <Skeleton className="h-4 w-44" />,
        hostedBy: <Skeleton className="h-4 w-36" />,
      }}
      interiorMain={
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      }
      interiorSide={<Skeleton className="h-48 w-full rounded-2xl" />}
    />
  )
}
