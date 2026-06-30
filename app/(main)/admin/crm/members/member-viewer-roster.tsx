import { EmptyState } from '@/components/ui/empty-state'
import { MemberViewer, type Facet, type MemberSummary } from '@/components/people/member-viewer'
import { getProfileSummaries } from '@/lib/connections/matching'
import { listMembersByFilter, type MemberFilter } from '@/lib/dashboard/scores'
import { tierLabel } from '@/lib/dashboard/verdict'
import type { ResonanceTier } from '@/lib/traits/compute'
import { loadMemberDetail } from './member-detail-actions'

// The Resonance CRM members surface, rendered through the REUSABLE member-viewer block (ADR-459) to
// prove the block reconfigures onto a real surface. KEEPS the list-first front door + the fail-safe
// empty state: it reads the same shared listMembersByFilter (no duplicated data access), maps each
// scored row to a presentation-neutral MemberSummary (handle + avatar BATCHED via getProfileSummaries,
// no N+1), and hands the viewer a `loadMemberDetail` server action that lazily assembles the right
// pane from existing readers. STAFF-GATED at the page. Semantic tokens only; copy plain, no em dashes.

const LIFECYCLE_LABELS: Record<string, string> = {
  new: 'New',
  activated: 'Activated',
  engaged: 'Engaged',
  at_risk: 'At risk',
  dormant: 'Dormant',
}

const TIER_FACET: Facet = {
  key: 'tier',
  label: 'Tier',
  options: (['resonant', 'cooling', 'at_risk'] as ResonanceTier[]).map((t) => ({
    value: t,
    label: tierLabel(t),
  })),
}

const LIFECYCLE_FACET: Facet = {
  key: 'stage',
  label: 'Lifecycle',
  options: Object.entries(LIFECYCLE_LABELS).map(([value, label]) => ({ value, label })),
}

/** Render the member-viewer for a filter (the full `all` roster, or a tier / lifecycle drill). Reads
 *  lowest-health first via the shared reader, then maps to the block's contract. Shows the passed
 *  empty copy when nobody is scored (the same fail-safe front door as the roster list). */
export async function MemberViewerRoster({
  filter,
  emptyTitle,
  emptyDescription,
}: {
  filter: MemberFilter
  emptyTitle: string
  emptyDescription: string
}) {
  const rows = await listMembersByFilter(filter)
  if (rows.length === 0) {
    return <EmptyState variant="first-use" title={emptyTitle} description={emptyDescription} />
  }

  // BATCH the handle + avatar lookups (no N+1): one read for every scored profile.
  const summaries = await getProfileSummaries(rows.map((r) => r.profileId))

  const members: MemberSummary[] = rows.map((r) => {
    const s = summaries.get(r.profileId)
    const handle = s?.handle ?? r.profileId
    const lifecycle = r.lifecycleStage ? LIFECYCLE_LABELS[r.lifecycleStage] ?? r.lifecycleStage : null
    return {
      id: r.profileId,
      handle,
      displayName: s?.displayName ?? r.name,
      avatarUrl: s?.avatarUrl ?? null,
      // Facet-matchable badges: the tier + the lifecycle stage (client-side facet filter reads these).
      badges: [r.resonanceTier, ...(r.lifecycleStage ? [r.lifecycleStage] : [])],
      headline: lifecycle
        ? `${tierLabel(r.resonanceTier)} · ${lifecycle}`
        : tierLabel(r.resonanceTier),
      stats: [{ label: 'Health', value: String(Math.round(r.resonanceHealth)) }],
    }
  })

  return (
    <MemberViewer
      members={members}
      loadDetail={loadMemberDetail}
      detailMode="full"
      defaultView="list"
      pageSize={15}
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
