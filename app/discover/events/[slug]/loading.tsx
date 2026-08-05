import { Skeleton } from '@/components/ui/skeleton'
import { EventDetailTemplate } from '@/components/templates'

// Loading shape for the PUBLIC event page. It composes EventDetailTemplate with skeleton nodes
// rather than hand-rolling a lookalike, for the same reason the in-app skeleton does: a
// hand-rolled copy drifts silently. This one had already drifted — it painted a single
// max-w-3xl column while its destination now renders the standard's two-column interior inside a
// max-w-5xl frame, so the page visibly jumped as it loaded.
//
// It mirrors the destination's ABSENT slots exactly: no cover, no operator actions, and no
// sticky RSVP bar (nothing to RSVP to while signed out), so no space is reserved for one.
export default function PublicEventDetailLoading() {
  return (
    <div className="relative overflow-hidden max-w-5xl mx-auto px-6 py-20 sm:py-24">
      <EventDetailTemplate
        hasActionBar={false}
        back={{ href: '/discover/events', label: 'Events' }}
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
        interiorSide={<Skeleton className="h-48 w-full rounded-card" />}
      />
    </div>
  )
}
