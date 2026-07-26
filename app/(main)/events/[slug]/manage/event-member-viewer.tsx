import { LeaderCrmViewer } from '@/components/people/leader-crm-viewer'
import { loadEventCrmRoster, RSVP_FACET } from '@/lib/events/crm-roster'
import { loadEventCrmDetail, openEventAttendeeDm } from './crm/actions'

// THE MESSAGE ATTENDEES VIEWER (CRM Everywhere plan 3.1 / ADR-827). The event's message center,
// embedded at the top of the Manage hub's Home tab: it awaits the roster (going/maybe RSVPs only,
// the owner ruling, each row badged for the RSVP facet) so the page shell paints immediately, then
// renders the ONE shared LeaderCrmViewer — the same wrapper Message Circle and the hub/nexus
// surfaces mount, with the event's RSVP facet and copy passed as knobs (never a parallel
// MemberViewer mount). The attendee count lives in the Home stat strip now, not a StatCard here.
// The detail loader is the gate + tenancy-checked loadEventCrmDetail bound to the slug
// (leader-trimmed altitude), and the Message button is the scoped-DM server action (no email on
// file required). No em dashes.

export async function EventMemberViewer({ eventId, slug }: { eventId: string; slug: string }) {
  const members = await loadEventCrmRoster(eventId)

  return (
    <LeaderCrmViewer
      members={members}
      loadDetail={loadEventCrmDetail.bind(null, slug)}
      openDm={openEventAttendeeDm.bind(null, slug)}
      empty={{
        title: 'No attendees yet',
        description:
          'When people RSVP going or maybe, they show up here, with everything about each one a click away.',
      }}
      extraFacets={[RSVP_FACET]}
      searchPlaceholder="Search attendees"
      noResults={{
        title: 'No attendees match',
        description: 'Try a different search or clear the RSVP filter.',
      }}
    />
  )
}
