import { EventDispatchCompose } from '@/components/events/event-dispatch-compose'
import { getEventContext } from '@/lib/events/active-event'

// The event "post an update" body module (the `event-dispatch` layout block): a self-fetching,
// zero-prop RSC the page-settings engine drops into the event detail page's arrangeable body.
// Reads the request-scoped event context (lib/events/active-event.ts) instead of taking props,
// then self-gates: only a host or cohost (canDispatch) sees the composer, and never on a
// cancelled event. Renders nothing otherwise, so an unauthorized viewer or a cancelled event
// leaves no empty slot. Mirrors the circle body modules (components/widgets/circles/*).
export const EventDispatch = async () => {
  const ctx = getEventContext()
  if (!ctx) return null

  const { event, canDispatch } = ctx
  if (!canDispatch || event.is_cancelled) return null

  return <EventDispatchCompose eventId={event.id} slug={event.slug} />
}
