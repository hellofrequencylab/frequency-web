import { Suspense } from 'react'
import { RecapAlbum } from '@/components/events/recap-album'
import { Skeleton } from '@/components/ui/skeleton'
import { getEventContext } from '@/lib/events/active-event'

// The event RECAP module (the `event-recap` layout block): the after-the-day photo album an operator
// places in the event page's arrangeable body. Self-fetches from the request-scoped event context
// (lib/events/active-event.ts) — no props, no prop-drilling. Mirrors the circle body modules.
//
// Self-gates on `hasEnded`: the recap only makes sense once the event is over, so it renders nothing
// while the event is still upcoming or in progress, leaving no empty slot. The upload/moderate
// affordances inside RecapAlbum stay gated by the viewer's own context (canContribute / isHost).
export const EventRecap = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  const { event, hasEnded, recapPhotos, canContribute, isHost, myProfileId } = ctx
  if (!hasEnded) return null

  return (
    <Suspense fallback={<Skeleton className="h-48 rounded-2xl" />}>
      <RecapAlbum
        eventId={event.id}
        slug={event.slug}
        photos={recapPhotos}
        canUpload={canContribute}
        canModerate={isHost}
        myProfileId={myProfileId}
      />
    </Suspense>
  )
}
