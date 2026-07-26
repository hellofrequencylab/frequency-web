import { EmptyState } from '@/components/ui/empty-state'
import { MemberViewer } from '@/components/people/member-viewer'
import type { CrmMemberDetail, MemberSummary } from '@/components/people/member-viewer'
import {
  MEMBER_SORT_OPTIONS,
  TIER_FACET,
  LIFECYCLE_FACET,
  ROLE_FACET,
  BUSINESS_FACET,
  ACTIVE_FACET,
} from '@/app/(main)/admin/crm/member-summaries'

// THE LEADER CRM VIEWER (CRM Everywhere plan Phase 4 / ADR-827). One wrapper for every leader-scope
// communication surface — Message Circle, and the hub/nexus member surfaces — so the module reads
// UNIFORM on every primary admin dashboard: the same master-detail <MemberViewer> as the platform
// Resonance CRM and the space Community Resonance (list left, member box right), the same sorts and
// facets, the leader-trimmed detail pane, and ONE big Message button bound to the host page's
// scoped-DM server action (no email on file required). The host page owns the gate, the roster
// load, and the bound actions; this wrapper owns the uniform presentation. Server Component shell
// over the one client island, same pattern as components/spaces/crm/space-member-viewer.tsx.

export function LeaderCrmViewer({
  members,
  loadDetail,
  openDm,
  empty,
}: {
  /** The scope's roster (already gated + loaded by the host page). */
  members: MemberSummary[]
  /** The scope-bound detail action: gate -> tenancy -> buildMemberDetail(audience 'leader'). */
  loadDetail: (id: string) => Promise<CrmMemberDetail>
  /** The scope-bound DM action: gate -> openScopedDm -> redirect into the thread. */
  openDm: (profileId: string) => Promise<void>
  /** First-use empty copy for a scope with nobody in it yet. */
  empty: { title: string; description: string }
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
