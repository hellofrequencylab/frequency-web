import { EmptyState } from '@/components/ui/empty-state'
import { MemberViewer } from '@/components/people/member-viewer'
import {
  MEMBER_SORT_OPTIONS,
  TIER_FACET,
  LIFECYCLE_FACET,
  ROLE_FACET,
  BUSINESS_FACET,
  ACTIVE_FACET,
} from '@/app/(main)/admin/crm/member-summaries'
import { loadEventCrmRoster, RSVP_FACET } from '@/lib/events/crm-roster'
import { loadEventCrmDetail, openEventAttendeeDm } from './actions'

// THE MESSAGE ATTENDEES VIEWER (CRM Everywhere plan 3.1 / ADR-827). The event-scoped mount of
// the ONE master-detail <MemberViewer> — the same block as the platform Resonance CRM cockpit
// and the space Community Resonance roster, showing THIS event's audience per the owner ruling:
// everyone RSVP'd going or maybe (loadEventCrmRoster), each row badged for the RSVP facet. The
// detail loader is the gate + tenancy-checked loadEventCrmDetail bound to the slug (leader-
// trimmed altitude), and the Message button is the scoped-DM server action (no email on file
// required). Server Component shell over the one client island. No em dashes.

export async function EventMemberViewer({ eventId, slug }: { eventId: string; slug: string }) {
  // The owner-ruled audience: going/maybe RSVPs only, badged rsvp:going / rsvp:maybe.
  const members = await loadEventCrmRoster(eventId)
  if (members.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No attendees yet"
        description="When people RSVP going or maybe, they show here with everything about each one a click away."
      />
    )
  }

  return (
    <MemberViewer
      members={members}
      loadDetail={loadEventCrmDetail.bind(null, slug)}
      detailVariant="crm"
      defaultView="list"
      pageSize={24}
      sortOptions={MEMBER_SORT_OPTIONS}
      search={{
        placeholder: 'Search attendees',
        facets: [RSVP_FACET, ROLE_FACET, BUSINESS_FACET, ACTIVE_FACET, TIER_FACET, LIFECYCLE_FACET],
      }}
      messaging={{ kind: 'dm', open: openEventAttendeeDm.bind(null, slug), label: 'Message' }}
      emptyState={
        <EmptyState
          variant="no-results"
          title="No attendees match"
          description="Try a different search or clear the RSVP filter."
        />
      }
    />
  )
}
