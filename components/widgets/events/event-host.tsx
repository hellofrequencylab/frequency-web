import { getEventContext } from '@/lib/events/active-event'
import { HostProfileBox } from '@/components/widgets/events/host-profile-box'
import { SpaceHostBox } from '@/components/widgets/events/space-host-box'
import { CollaboratorSpacesBox } from '@/components/widgets/events/collaborator-spaces-box'

// The event Host profile box (the `event-lineup` layout module, repurposed from the old poster
// "Lineup" section). A self-fetching RSC bound in the widget registry: it reads the request-scoped
// event context and renders the host. When the event is posted from a SPACE (ctx.spaceHost), the Space
// is the host — its brand box, with the individual organizer as a quiet credit. Otherwise it hands the
// person host to the client island that renders the PersonCard + "Message Host" modal. Self-hides when
// there is neither a Space nor a resolvable person host (an unclaimed import). The block id stays
// `event-lineup` to avoid a layout migration.
//
// TWO DISTINCT co-hosting relations render on an event page (ADR-834), and this module carries the
// FEATURED one:
//   B. COLLABORATORS — Spaces co-hosting via an accepted event_space_share (EC3): the logo card
//      right under the Host box (calendar visibility + credit, NO management access).
//   A. COHOSTS — members helping run the event (event_cohosts): quiet avatar chips in the separate
//      `event-cohosts` module lower on the page (management access via isEventCohost).
export const EventHost = async () => {
  const ctx = getEventContext()
  if (!ctx) return null

  const collaborators = <CollaboratorSpacesBox spaces={ctx.collaboratorSpaces} />

  // Space-hosted: the Space is the attribution; the person in host_id is shown as the organizer credit.
  if (ctx.spaceHost) {
    return (
      <div className="space-y-4">
        <SpaceHostBox space={ctx.spaceHost} organizerName={ctx.host?.display_name ?? null} />
        {collaborators}
      </div>
    )
  }

  if (!ctx.host) {
    // No resolvable host (an unclaimed import) — still credit any collaborating Spaces.
    return ctx.collaboratorSpaces.length > 0 ? collaborators : null
  }

  // The viewer may message the host when signed in and not the host themselves.
  const canMessage = !!ctx.myProfileId && !ctx.isHost

  return (
    <div className="space-y-4">
      <HostProfileBox
        host={ctx.host}
        eventId={ctx.event.id}
        canMessage={canMessage}
        signInHref={ctx.facts.signInHref}
      />
      {collaborators}
    </div>
  )
}
