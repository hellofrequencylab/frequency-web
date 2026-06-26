import { Suspense } from 'react'
import { EventActivity } from '@/components/events/event-activity'
import { Skeleton } from '@/components/ui/skeleton'
import { getEventContext } from '@/lib/events/active-event'

// The movable event ACTIVITY block (the `event-activity` layout module): the merged
// Dispatch + guest-comment feed an operator places anywhere on the event page via the
// Layout editor. A zero-prop self-fetching RSC — it reads the already-resolved event
// detail context (poster, activity posts, viewer gates) stamped once by the detail page,
// so there's no re-fetch and no prop-drilling. Off an event detail route the context is
// null and the block renders nothing, so an unbound slot never leaves an empty shell.
export const EventActivityBlock = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  const { event, activityPosts, canContribute, isHost, myProfileId, isPast } = ctx

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
      />
    </Suspense>
  )
}
