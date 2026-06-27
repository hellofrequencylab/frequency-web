import { Suspense } from 'react'
import { EventActivity } from '@/components/events/event-activity'
import { EventDispatchCompose } from '@/components/events/event-dispatch-compose'
import { Skeleton } from '@/components/ui/skeleton'
import { getEventContext } from '@/lib/events/active-event'

// The movable event ACTIVITY block (the `event-activity` layout module): the ONE composer
// over the merged Dispatch + guest-comment feed, an operator places anywhere on the event
// page via the Layout editor. A zero-prop self-fetching RSC — it reads the already-resolved
// event detail context (poster, activity posts, viewer gates) stamped once by the detail
// page, so there's no re-fetch and no prop-drilling. Off an event detail route the context
// is null and the block renders nothing, so an unbound slot never leaves an empty shell.
//
// ONE role-based composer (no separate `event-dispatch` box): hosts/cohosts (the SAME
// canDispatch gate the old dispatch module used) get the "Post an update" composer; everyone
// else who may contribute gets the "Say hi before the event" composer. The stream renders
// below either way, unchanged. On a cancelled event the dispatch composer is gated off (it
// never showed there), so attendees fall back to the say-hi composer's own canPost gate.
export const EventActivityBlock = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  const { event, activityPosts, canContribute, canDispatch, isHost, myProfileId, isPast } = ctx

  // Host/cohost composer — the same gate the standalone dispatch module enforced (and never
  // on a cancelled event). Rendered as the activity composer so it isn't a separate box.
  const dispatchComposer =
    canDispatch && !event.is_cancelled ? (
      <EventDispatchCompose eventId={event.id} slug={event.slug} />
    ) : null

  return (
    <Suspense fallback={<Skeleton className="h-40 rounded-2xl" />}>
      <EventActivity
        eventId={event.id}
        slug={event.slug}
        posts={activityPosts}
        canPost={canContribute && !event.is_cancelled}
        canModerate={isHost}
        myProfileId={myProfileId}
        isPast={isPast}
        dispatchComposer={dispatchComposer}
      />
    </Suspense>
  )
}
