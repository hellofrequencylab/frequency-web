import { getProfileSummaries } from '@/lib/connections/matching'
import { createAdminClient } from '@/lib/supabase/admin'
import { listMembersByFilter, type MemberFilter } from '@/lib/dashboard/scores'
import { classifyMembers } from '@/lib/crm/classification'
import { relationshipLabel } from '@/lib/crm/relationships'
import { ROLE_LABEL } from '@/lib/community-roles'
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

// ── R2: the members-only roster facets (Resonance CRM restructure, ADR-625) ──────
// Three facets that refine PURELY over the classifier fields already on each MemberSummary (community
// role, business standing, active-this-week) — no new query. Each option value is a namespaced token
// (`role:` / `biz:` / `active:`) that loadMemberSummaries writes into the row's `badges`, so the
// viewer's existing pure `matchesFacets` filters them without collision with the tier / lifecycle
// values. These are wired on the CRM roster only (the cockpit); shared browse hosts never pass them.

/** The community-role facet. Offers the trust rungs a member roster reads on (Member / Host / Guide /
 *  Mentor), labeled from the canonical ROLE_LABEL. The deprecated operational rungs (admin / janitor)
 *  and the paid-Crew rung are intentionally omitted from the filter menu. */
export const ROLE_FACET: Facet = {
  key: 'role',
  label: 'Role',
  options: (['member', 'host', 'guide', 'mentor'] as const).map((r) => ({
    value: `role:${r}`,
    label: ROLE_LABEL[r],
  })),
}

/** The business (yes / no) facet: does the member operate a Space? Label from the CRM relationship
 *  registry's derived `business` kind so the roster and the registry stay in one voice. */
export const BUSINESS_FACET: Facet = {
  key: 'business',
  label: relationshipLabel('business'),
  options: [
    { value: 'biz:yes', label: 'Runs a Space' },
    { value: 'biz:no', label: 'Not a business' },
  ],
}

/** The activity facet: active this week vs. quiet this week (over the classifier's `activeThisWeek`). */
export const ACTIVE_FACET: Facet = {
  key: 'active',
  label: 'Activity',
  options: [
    { value: 'active:yes', label: 'Active this week' },
    { value: 'active:no', label: 'Quiet this week' },
  ],
}

/** The hero sort options every member-viewer host offers. Recent leads (most-recently-joined first,
 *  the default), then Active (most engaged / healthiest first), Needs help (lowest health first),
 *  Active now (active-this-week first, over the classifier signal), and Name (A to Z). Each drives the
 *  pure applyQuery sort over a row's sortValues / stats. */
export const MEMBER_SORT_OPTIONS: SortOption[] = [
  { key: 'recent', label: 'Recent', spec: { key: 'joined', direction: 'desc' } },
  { key: 'active', label: 'Active', spec: { key: 'Health', direction: 'desc' } },
  { key: 'needs-help', label: 'Needs help', spec: { key: 'Health', direction: 'asc' } },
  { key: 'active-now', label: 'Active now', spec: { key: 'activeThisWeek', direction: 'desc' } },
  { key: 'name', label: 'Name', spec: { key: 'name', direction: 'asc' } },
]

/** The community-role values that earn a role badge / role-facet token (the trust ladder). The
 *  operational web rungs (admin / janitor) are excluded — they are not community standing. */
const ROSTER_ROLE_KEYS: readonly string[] = ['member', 'crew', 'host', 'guide', 'mentor']

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
export async function loadMemberSummaries(
  filter: MemberFilter,
  opts: { spaceId?: string | null } = {},
): Promise<MemberSummary[]> {
  const rows = await listMembersByFilter(filter, { spaceId: opts.spaceId })
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
    const isBusiness = cls?.isBusiness ?? false
    const activeThisWeek = cls?.isActive ?? false
    // R2 facet tokens over the classifier fields, namespaced so they never collide with the tier /
    // lifecycle badge values the same filter reads: a `role:<rung>` token for the trust ladder, and
    // yes/no tokens for business standing + activity so the facet can filter EITHER side.
    const roleBadge =
      cls?.communityRole && ROSTER_ROLE_KEYS.includes(cls.communityRole)
        ? [`role:${cls.communityRole}`]
        : []
    return {
      id: r.profileId,
      handle,
      displayName: s?.displayName ?? r.name,
      avatarUrl: s?.avatarUrl ?? null,
      // Facet-matchable badges: the tier + lifecycle stage, plus the R2 role / business / activity
      // tokens (client-side facet filter reads all of these).
      badges: [
        r.resonanceTier,
        ...(r.lifecycleStage ? [r.lifecycleStage] : []),
        ...roleBadge,
        isBusiness ? 'biz:yes' : 'biz:no',
        activeThisWeek ? 'active:yes' : 'active:no',
      ],
      headline: lifecycle ? `${tierLabel(r.resonanceTier)} · ${lifecycle}` : tierLabel(r.resonanceTier),
      stats: [{ label: 'Health', value: String(Math.round(r.resonanceHealth)) }],
      // Pre-computed sort signals (not rendered as stats): "Recent" reads `joined`; "Active now" reads
      // `activeThisWeek` (1 before 0 under a desc sort).
      sortValues: { joined, activeThisWeek: activeThisWeek ? 1 : 0 },
      // Resonance CRM classification (ADR-625), fail-safe to sensible defaults on a miss. The single
      // extension point R2 (card role tag + stats) and R3/R5 (sorting, upgrade signal) consume.
      communityRole: cls?.communityRole ?? null,
      isBusiness,
      activeThisWeek,
      spacesOwned: cls?.spacesOwned ?? 0,
    }
  })
}
