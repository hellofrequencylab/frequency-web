import { getEventContext } from '@/lib/events/active-event'
import { HostProfileBox } from '@/components/widgets/events/host-profile-box'

// The event Host profile box (the `event-lineup` layout module, repurposed from the old poster
// "Lineup" section). A self-fetching RSC bound in the widget registry: it reads the request-scoped
// event context, resolves the host's public profile, and hands it to the client island that renders
// the PersonCard + the "Message Host" modal. Self-hides when the event has no resolvable host (an
// unclaimed import) so the module never leaves an empty slot. The block id stays `event-lineup` to
// avoid a layout migration.
export const EventHost = async () => {
  const ctx = getEventContext()
  if (!ctx || !ctx.host) return null

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
