import { EmptyState } from '@/components/ui/empty-state'
import { MemberViewer } from '@/components/people/member-viewer'
import type { CrmMemberDetail, Facet, MemberSummary } from '@/components/people/member-viewer'
import type { ActionResult } from '@/lib/action-result'
import {
  MEMBER_SORT_OPTIONS,
  TIER_FACET,
  LIFECYCLE_FACET,
  ROLE_FACET,
  BUSINESS_FACET,
  ACTIVE_FACET,
} from '@/app/(main)/admin/crm/member-summaries'

// THE LEADER CRM VIEWER (CRM Everywhere plan Phase 4 / ADR-827). One wrapper for EVERY leader-scope
// communication surface — Message Circle, the hub/nexus member surfaces, and Message Attendees — so
// the module reads UNIFORM on every primary admin dashboard: the same master-detail <MemberViewer>
// as the platform Resonance CRM and the space Community Resonance (list left, member box right),
// the same sorts and facets, the leader-trimmed detail pane, and ONE big Message button bound to
// the host page's scoped-DM server action (no email on file required). The host page owns the gate,
// the roster load, and the bound actions; this wrapper owns the uniform presentation. Scope color
// comes through the small optional knobs (extra facets, search placeholder, no-results copy), never
// a parallel mount. Server Component shell over the one client island, same pattern as
// components/spaces/crm/space-member-viewer.tsx.

export function LeaderCrmViewer({
  members,
  loadDetail,
  openDm,
  empty,
  extraFacets = [],
  searchPlaceholder = 'Search members',
  noResults = {
    title: 'No members match',
    description: 'Try a different search or clear the tier and lifecycle filters.',
  },
}: {
  /** The scope's roster (already gated + loaded by the host page). */
  members: MemberSummary[]
  /** The scope-bound detail action: gate -> tenancy -> buildMemberDetail(audience 'leader'). */
  loadDetail: (id: string) => Promise<CrmMemberDetail>
  /** The scope-bound DM action: gate -> openScopedDm -> redirect into the thread (void), or an
   *  ActionResult refusal the detail pane renders inline. */
  openDm: (profileId: string) => Promise<ActionResult | void>
  /** First-use empty copy for a scope with nobody in it yet. */
  empty: { title: string; description: string }
  /** Scope-specific facets, PREPENDED to the shared set (e.g. the event RSVP facet). */
  extraFacets?: Facet[]
  /** The search placeholder (e.g. "Search attendees" on an event). */
  searchPlaceholder?: string
  /** The no-results copy when a search/filter matches nobody. */
  noResults?: { title: string; description: string }
}) {
  if (members.length === 0) {
    return <EmptyState variant="first-use" title={empty.title} description={empty.description} />
  }

  return (
    <MemberViewer
      members={members}
      loadDetail={loadDetail}
      detailVariant="crm"
      messaging={{ kind: 'dm', open: openDm, label: 'Message' }}
      defaultView="list"
      pageSize={24}
      sortOptions={MEMBER_SORT_OPTIONS}
      search={{
        placeholder: searchPlaceholder,
        facets: [...extraFacets, ROLE_FACET, BUSINESS_FACET, ACTIVE_FACET, TIER_FACET, LIFECYCLE_FACET],
      }}
      emptyState={
        <EmptyState variant="no-results" title={noResults.title} description={noResults.description} />
      }
    />
  )
}
