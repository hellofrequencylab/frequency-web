import { getProfileSummaries } from '@/lib/connections/matching'
import { createAdminClient } from '@/lib/supabase/admin'
import { listMembersByFilter, type MemberFilter } from '@/lib/dashboard/scores'
import { classifyMembers } from '@/lib/crm/classification'
import { tierLabel } from '@/lib/dashboard/verdict'
import type { Facet, MemberSummary, SortOption } from '@/components/people/member-viewer'

// The ONE mapper that turns the shared scored roster (listMembersByFilter) into the member-viewer's
// presentation-neutral MemberSummary[], reused by BOTH the cockpit top viewer and the standalone
// members surface so they read identically. KEEPS the list-first front door: it reads the same
// shared reader (no duplicated data access) and BATCHES the handle/avatar lookup + the joined-at
// lookup (no N+1: two batched reads for the whole list, never one-per-row). Every visible string is
// in voice (no em dashes). The HERO sort options + the facets live here too, so both hosts pass the
// same set and the block renders the same headline controls.

const LIFECYCLE_LABELS: Record<string, string> = {
  new: 'New',
  activated: 'Activated',
  engaged: 'Engaged',
  at_risk: 'At risk',
  dormant: 'Dormant',
}

/** The tier facet (the red/amber/green band). */
export const TIER_FACET: Facet = {
  key: 'tier',
  label: 'Tier',
  options: (['resonant', 'cooling', 'at_risk'] as const).map((t) => ({ value: t, label: tierLabel(t) })),
}

/** The lifecycle facet (the new -> dormant climb step). */
export const LIFECYCLE_FACET: Facet = {
  key: 'stage',
  label: 'Lifecycle',
  options: Object.entries(LIFECYCLE_LABELS).map(([value, label]) => ({ value, label })),
}

/** The hero sort options every member-viewer host offers. Recent leads (most-recently-joined first,
 *  the default), then Active (most engaged / healthiest first), Needs help (lowest health first),
 *  and Name (A to Z). Each drives the pure applyQuery sort over a row's sortValues / stats. */
export const MEMBER_SORT_OPTIONS: SortOption[] = [
  { key: 'recent', label: 'Recent', spec: { key: 'joined', direction: 'desc' } },
  { key: 'active', label: 'Active', spec: { key: 'Health', direction: 'desc' } },
  { key: 'needs-help', label: 'Needs help', spec: { key: 'Health', direction: 'asc' } },
  { key: 'name', label: 'Name', spec: { key: 'name', direction: 'asc' } },
]

/** Batch-read the joined-at epoch (profiles.created_at) for a set of profile ids. One read for the
 *  whole list (no N+1). FAIL-SAFE: an empty map on any error, so "Recent" simply falls back to the
 *  reader's own order. */
async function joinedAtFor(profileIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (profileIds.length === 0) return map
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('profiles').select('id, created_at').in('id', profileIds)
    for (const r of (data as { id: string; created_at: string | null }[] | null) ?? []) {
      const t = r.created_at ? Date.parse(r.created_at) : NaN
      if (Number.isFinite(t)) map.set(r.id, t)
    }
  } catch {
    /* fall through to the empty map */
  }
  return map
}

/** Load + map the scored roster for a filter into MemberSummary[] (recency-sortable, facet-matchable).
 *  Returns [] when nobody is scored, so the host shows its fail-safe empty state. */
export async function loadMemberSummaries(filter: MemberFilter): Promise<MemberSummary[]> {
  const rows = await listMembersByFilter(filter)
  if (rows.length === 0) return []

  const profileIds = rows.map((r) => r.profileId)
  // Three BATCHED reads for the whole list (no N+1): the handle/avatar summaries, the joined-at
  // epoch, and the Resonance CRM classification (community role, business, active-this-week, spaces
  // owned) via the classifier's set-based batch path. classifyMembers is fail-safe to an empty map,
  // so a classification miss simply leaves the sensible defaults below.
  const [summaries, joinedAt, classifications] = await Promise.all([
    getProfileSummaries(profileIds),
    joinedAtFor(profileIds),
    classifyMembers(profileIds),
  ])

  return rows.map((r, i) => {
    const s = summaries.get(r.profileId)
    const handle = s?.handle ?? r.profileId
    const lifecycle = r.lifecycleStage ? LIFECYCLE_LABELS[r.lifecycleStage] ?? r.lifecycleStage : null
    const cls = classifications.get(r.profileId)
    // "Recent" sorts on the joined epoch; when unknown, fall back to the reader's order (reversed so
    // earlier-listed rows still read as "more recent" than later ones under a desc sort).
    const joined = joinedAt.get(r.profileId) ?? rows.length - i
    return {
      id: r.profileId,
      handle,
      displayName: s?.displayName ?? r.name,
      avatarUrl: s?.avatarUrl ?? null,
      // Facet-matchable badges: the tier + the lifecycle stage (client-side facet filter reads these).
      badges: [r.resonanceTier, ...(r.lifecycleStage ? [r.lifecycleStage] : [])],
      headline: lifecycle ? `${tierLabel(r.resonanceTier)} · ${lifecycle}` : tierLabel(r.resonanceTier),
      stats: [{ label: 'Health', value: String(Math.round(r.resonanceHealth)) }],
      // The pre-computed "Recent" signal (not rendered as a stat).
      sortValues: { joined },
      // Resonance CRM classification (ADR-625), fail-safe to sensible defaults on a miss. The single
      // extension point R2 (card role tag + stats) and R3/R5 (sorting, upgrade signal) consume.
      communityRole: cls?.communityRole ?? null,
      isBusiness: cls?.isBusiness ?? false,
      activeThisWeek: cls?.isActive ?? false,
      spacesOwned: cls?.spacesOwned ?? 0,
    }
  })
}
