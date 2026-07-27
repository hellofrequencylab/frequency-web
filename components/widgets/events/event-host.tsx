import { getEventContext } from '@/lib/events/active-event'
import { HostCohostSection } from '@/components/widgets/events/host-cohost-section'

// The `event-lineup` layout module (repurposed from the old poster "Lineup" section) — now the ONE
// "Host & Co Hosts" card on an event page. A self-fetching RSC bound in the widget registry: it
// reads the request-scoped event context and hands the four credited groups to the section, which
// self-hides when there is nothing to credit. The block id stays `event-lineup` to avoid a layout
// migration.
//
// The section is a DISPLAY merge of what used to be two stacked boxes (HOST + COLLABORATORS). The
// two relations behind it stay distinct exactly as ADR-834/835 require:
//   B. COLLABORATORS — Spaces co-hosting via an accepted event_space_share (EC3). Featured credit +
//      calendar visibility, NO management access. Shown as Space Co Host rows.
//   A. COHOSTS — people helping run the event (event_cohosts), management access via isEventCohost.
//      Shown as Person Co Host rows in the section's inset panel; the host's add / remove / transfer
//      controls stay in the separate `event-cohosts` module.
export const EventHost = async () => {
  const ctx = getEventContext()
  if (!ctx) return null

  return (
    <HostCohostSection
      spaceHost={ctx.spaceHost}
      host={ctx.host}
      collaboratorSpaces={ctx.collaboratorSpaces}
      cohosts={ctx.cohosts}
      eventId={ctx.event.id}
      // The viewer may message the host when signed in and not the host themselves.
      canMessage={!!ctx.myProfileId && !ctx.isHost}
      signInHref={ctx.facts.signInHref}
    />
  )
}
