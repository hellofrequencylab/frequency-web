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
} from './member-summaries'
import { loadMemberDetail } from './members/member-detail-actions'

// THE COCKPIT'S TOP MEMBER VIEWER (ADR-459 · R2 members-only roster, ADR-625). The scored roster sits
// at the TOP of the cockpit as the reusable member-viewer block: this is the MEMBERS-ONLY view — the
// scored matview it reads (loadMemberSummaries with { kind: 'all' }) only ever holds PROFILED members,
// so leads and subscribers never appear here (they live on the separate Contacts tab). Rows carry the
// hero sort (Recent / Active / Needs help / Active now / Name) + live search as the headline, plus the
// role / business / activity facets. It reuses the ONE shared loadMemberSummaries mapper (no duplicated
// data access; batched, no N+1) and the same loadMemberDetail rich pane as the standalone members
// surface, so the cockpit and the drill read identically. FAIL-SAFE: a calm empty state when nobody is
// scored yet. Server Component shell over the one client island. No em dashes.

export async function CockpitMemberViewer({ initialSelectedId }: { initialSelectedId?: string } = {}) {
  // Members-only by construction: { kind: 'all' } reads the scored roster matview, which is populated
  // only for PROFILED members. Leads / subscribers are handled by the separate Contacts tab.
  const members = await loadMemberSummaries({ kind: 'all' })
  if (members.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No members scored yet"
        description="Once the overnight refresh scores members, your whole roster shows here, sorted by who joined most recently."
      />
    )
  }

  return (
    <MemberViewer
      members={members}
      loadDetail={loadMemberDetail}
      detailVariant="crm"
      defaultView="list"
      pageSize={24}
      initialSelectedId={initialSelectedId}
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
