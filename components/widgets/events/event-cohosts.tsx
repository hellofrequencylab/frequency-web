import { getEventContext } from '@/lib/events/active-event'
import { CohostManager } from '@/components/events/cohost-manager'

// The event COHOSTS layout module: a self-fetching RSC that an operator places anywhere on the event
// detail page via the page-settings module engine. Reads the request-scoped event context (stamped
// once by the detail page — lib/events/active-event.ts) so it never re-fetches or prop-drills.
//
// Self-gate: the host always sees this (so they can add the first cohost); everyone else only sees it
// once there's at least one cohost to show. With nothing to show and nothing to do, render nothing so
// an empty slot never appears. The wrapped CohostManager applies the same gate internally.
export const EventCohosts = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  const { event, cohosts, isHost } = ctx
  if (cohosts.length === 0 && !isHost) return null

  return <CohostManager eventId={event.id} slug={event.slug} cohosts={cohosts} canManage={isHost} />
}
