import Link from 'next/link'
import { Lock } from 'lucide-react'
import { LeaderCrmViewer } from '@/components/people/leader-crm-viewer'
import { loadEventCrmRoster, RSVP_FACET } from '@/lib/events/crm-roster'
import {
  loadEventCrmAccess,
  EVENT_CRM_LOCKED_MESSAGE,
  EVENT_CRM_UPSELL_LINE,
  EVENT_CRM_UPSELL_HREF,
} from '@/lib/events/crm-access'
import { loadEventCrmDetail, openEventAttendeeDm } from './crm/actions'

// THE MESSAGE ATTENDEES VIEWER (CRM Everywhere plan 3.1 / ADR-827). The event's message center,
// embedded at the top of the Manage hub's Home tab: it awaits the roster (going/maybe RSVPs only,
// the owner ruling, each row badged for the RSVP facet) so the page shell paints immediately, then
// renders the ONE shared LeaderCrmViewer — the same wrapper Message Circle and the hub/nexus
// surfaces mount, with the event's RSVP facet and copy passed as knobs (never a parallel
// MemberViewer mount). The attendee count lives in the Home stat strip now, not a StatCard here.
// The detail loader is the gate + tenancy-checked loadEventCrmDetail bound to the slug
// (leader-trimmed altitude), and the Message button is the scoped-DM server action (no email on
// file required).
//
// ACCESS TIERS (ADR-836): the roster + metrics render for every tier that can open the surface;
// when the viewer's free-form messaging is locked (a personal-tier host/cohost after the event
// ends), the Message button drops (messaging 'none') and one quiet locked line with the Business
// Space upsell renders above the viewer. The server actions re-check the tier either way. No em
// dashes.

export async function EventMemberViewer({ eventId, slug }: { eventId: string; slug: string }) {
  const [members, access] = await Promise.all([
    loadEventCrmRoster(eventId),
    loadEventCrmAccess(eventId),
  ])
  const locked = !access.canMessage

  return (
    <div className="space-y-3">
      {locked && (
        <p className="flex items-start gap-1.5 rounded-xl border border-border bg-surface-elevated px-3 py-2 text-2xs text-muted">
          <Lock className="mt-px h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
          <span>
            {EVENT_CRM_LOCKED_MESSAGE}{' '}
            <Link href={EVENT_CRM_UPSELL_HREF} className="font-medium text-primary hover:underline">
              {EVENT_CRM_UPSELL_LINE}
            </Link>
          </span>
        </p>
      )}
      <LeaderCrmViewer
        members={members}
        loadDetail={loadEventCrmDetail.bind(null, slug)}
        openDm={openEventAttendeeDm.bind(null, slug)}
        messaging={locked ? { kind: 'none' } : undefined}
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
    </div>
  )
}
