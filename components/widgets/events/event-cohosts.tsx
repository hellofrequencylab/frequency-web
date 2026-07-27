import { getEventContext } from '@/lib/events/active-event'
import { CohostManager } from '@/components/events/cohost-manager'

// The event COHOSTS layout module: a self-fetching RSC that an operator places anywhere on the event
// detail page via the page-settings module engine. Reads the request-scoped event context (stamped
// once by the detail page — lib/events/active-event.ts) so it never re-fetches or prop-drills.
//
// HOST-ONLY since the Host & Co Hosts merge: the PUBLIC credit for a person co-hosting now lives in
// the `event-lineup` section alongside the Host and the Space Co Hosts, so this module is purely the
// host's controls (invite, remove, cancel a pending invite, transfer the host role). Rendering it to
// everyone would name the same people twice on one page. Nothing about the relation changed — these
// are still event_cohosts rows with management access via isEventCohost.
export const EventCohosts = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  const { event, cohosts, cohostInvites, isHost } = ctx
  if (!isHost) return null

  return (
    <CohostManager
      eventId={event.id}
      slug={event.slug}
      cohosts={cohosts}
      pendingInvites={cohostInvites}
      canManage
    />
  )
}
