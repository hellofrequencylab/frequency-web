import { EmptyState } from '@/components/ui/empty-state'
import { MemberViewer } from '@/components/people/member-viewer'
import { type MemberFilter } from '@/lib/dashboard/scores'
import {
  loadMemberSummaries,
  MEMBER_SORT_OPTIONS,
  TIER_FACET,
  LIFECYCLE_FACET,
} from '../member-summaries'
import { loadMemberDetail } from './member-detail-actions'

// The Resonance CRM members surface = the FULLY-FEATURED member-viewer (ADR-459). KEEPS the
// list-first front door + the fail-safe empty state: it reads the shared scored roster through the
// one loadMemberSummaries mapper (no duplicated data access; handle/avatar + joined-at BATCHED, no
// N+1), and hands the viewer a `loadMemberDetail` server action that lazily assembles the RICH right
// pane (role designators, active funnels, the CRM pipeline stage, the truncated interaction timeline,
// and a prominent View member button) from EXISTING readers only. Default 10 rows, most-recent first,
// with the hero sort (Recent / Active / Needs help / Name) + live search as the headline controls.
// STAFF-GATED at the page. Semantic tokens only; copy plain, no em dashes.

/** Render the fully-featured member-viewer for a filter (the full `all` roster, or a tier / lifecycle
 *  drill). Shows the passed empty copy when nobody is scored (the same fail-safe front door). */
export async function MemberViewerRoster({
  filter,
  emptyTitle,
  emptyDescription,
}: {
  filter: MemberFilter
  emptyTitle: string
  emptyDescription: string
}) {
  const members = await loadMemberSummaries(filter)
  if (members.length === 0) {
    return <EmptyState variant="first-use" title={emptyTitle} description={emptyDescription} />
  }

  return (
    <MemberViewer
      members={members}
      loadDetail={loadMemberDetail}
      detailMode="full"
      defaultView="list"
      pageSize={10}
      sortOptions={MEMBER_SORT_OPTIONS}
      search={{ placeholder: 'Search members', facets: [TIER_FACET, LIFECYCLE_FACET] }}
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
