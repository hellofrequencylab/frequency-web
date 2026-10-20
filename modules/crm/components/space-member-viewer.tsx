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
import { loadSpaceResonanceDetail } from '@/app/(main)/admin/crm/members/member-detail-actions'
import { loadSpaceResonanceRoster } from '@/lib/spaces/resonance-roster'

// THE SPACE RESONANCE CRM ROSTER (ADR-789). The space-scoped twin of the admin Resonance CRM's
// CockpitMemberViewer: the SAME master-detail <MemberViewer> — a roster on the left, the full detail inline
// on the right ("pick a member to see everything about them") — but showing THIS space's ACTUAL people:
// EVERY active member (scored or not) PLUS every imported contact/lead (loadSpaceResonanceRoster). The
// detail loader dispatches by row id — a `contact:<uuid>` id loads the contact detail, any other id a
// member — through the space-gated + tenancy-checked loadSpaceResonanceDetail (bound to the slug). So in a
// space page, this IS the CRM: all contacts and members appear here. Server Component shell over the one
// client island. No em dashes.

export async function SpaceMemberViewer({ spaceId, slug }: { spaceId: string; slug: string }) {
  // ALL of the space's people: every active member (scored or not) + every imported contact, newest first.
  const members = await loadSpaceResonanceRoster(spaceId)
  if (members.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No members or contacts yet"
        description="Invite members or import contacts into this space and they show here, newest first, with everything about each one a click away."
      />
    )
  }

  return (
    <MemberViewer
      members={members}
      loadDetail={loadSpaceResonanceDetail.bind(null, slug)}
      detailVariant="crm"
      messageScope={{ spaceId, slug }}
      defaultView="list"
      pageSize={24}
      sortOptions={MEMBER_SORT_OPTIONS}
      // Default this roster to "Most complete" so the contacts you actually filled out (a name, phone,
      // company) surface above the bare email-only imports, instead of newest-first burying them.
      sort={{ key: 'completeness', direction: 'desc' }}
      search={{
        placeholder: 'Search members',
        facets: [ROLE_FACET, BUSINESS_FACET, ACTIVE_FACET, TIER_FACET, LIFECYCLE_FACET],
      }}
      emptyState={
        <EmptyState
          variant="no-results"
          title="No members match"
          description="Try a different search or clear the tier and lifecycle filters."
        />
      }
    />
  )
}
