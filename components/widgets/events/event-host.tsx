import { getEventContext } from '@/lib/events/active-event'
import { HostProfileBox } from '@/components/widgets/events/host-profile-box'
import { SpaceHostBox } from '@/components/widgets/events/space-host-box'

// The event Host profile box (the `event-lineup` layout module, repurposed from the old poster
// "Lineup" section). A self-fetching RSC bound in the widget registry: it reads the request-scoped
// event context and renders the host. When the event is posted from a SPACE (ctx.spaceHost), the Space
// is the host — its brand box, with the individual organizer as a quiet credit. Otherwise it hands the
// person host to the client island that renders the PersonCard + "Message Host" modal. Self-hides when
// there is neither a Space nor a resolvable person host (an unclaimed import). The block id stays
// `event-lineup` to avoid a layout migration.
export const EventHost = async () => {
  const ctx = getEventContext()
  if (!ctx) return null

  // Space-hosted: the Space is the attribution; the person in host_id is shown as the organizer credit.
  if (ctx.spaceHost) {
    return <SpaceHostBox space={ctx.spaceHost} organizerName={ctx.host?.display_name ?? null} />
  }

  if (!ctx.host) return null

  // The viewer may message the host when signed in and not the host themselves.
  const canMessage = !!ctx.myProfileId && !ctx.isHost

  return (
    <HostProfileBox
      host={ctx.host}
      eventId={ctx.event.id}
      canMessage={canMessage}
      signInHref={ctx.facts.signInHref}
    />
  )
}
