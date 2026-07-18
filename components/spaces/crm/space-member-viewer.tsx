import { EmptyState } from '@/components/ui/empty-state'
import { MemberViewer } from '@/components/people/member-viewer'
import {
  loadMemberSummaries,
  MEMBER_SORT_OPTIONS,
  TIER_FACET,
  LIFECYCLE_FACET,
  ROLE_FACET,
  BUSINESS_FACET,
  ACTIVE_FACET,
} from '@/app/(main)/admin/crm/member-summaries'
import { loadSpaceMemberDetail } from '@/app/(main)/admin/crm/members/member-detail-actions'

// THE SPACE RESONANCE CRM ROSTER (ADR-787). The space-scoped twin of the admin Resonance CRM's
// CockpitMemberViewer: the SAME master-detail <MemberViewer> — a scored roster on the left, the full
// member detail inline on the right ("pick a member to see everything about them") — but scoped to THIS
// space's reachable members. It reads the same roster mapper with a `spaceId` (loadMemberSummaries), and
// the same rich detail builder through the space-gated + tenancy-checked `loadSpaceMemberDetail` (bound to
// the slug). So the space Resonance tab and the admin Resonance CRM read identically; only the scope + gate
// differ. Server Component shell over the one client island. No em dashes.

export async function SpaceMemberViewer({ spaceId, slug }: { spaceId: string; slug: string }) {
  // Members-only by construction: { kind: 'all' } reads the scored roster matview, scoped to this space's
  // reachable members. Leads / subscribers are handled by the CRM board's Contacts view.
  const members = await loadMemberSummaries({ kind: 'all' }, { spaceId })
  if (members.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No members scored yet"
        description="Bring contacts into this space and, once the overnight refresh scores them, your whole roster shows here, newest first."
      />
    )
  }

  return (
    <MemberViewer
      members={members}
      loadDetail={loadSpaceMemberDetail.bind(null, slug)}
      detailVariant="crm"
      defaultView="list"
      pageSize={24}
      sortOptions={MEMBER_SORT_OPTIONS}
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
