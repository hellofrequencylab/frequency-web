import type { AdminPracticeFacets, AdminPracticeSearchOpts } from '@/lib/practices'

// Residual ("minus-self") facet counts for the practices curation workspace (LIVE-646, ADR-1609).
//
// Each facet group is counted under every active filter EXCEPT its own, so the number beside an
// option is the row total of the view that choosing it would show: pick "Pending (4)" and the
// table shows 4 rows. A single-select dropdown replaces its own value, so its own filter must not
// narrow its counts; a toggle adds itself, so its count is the rows that carry it.
//
// Pure: the caller (searchAdminFacets in lib/practices.ts) reads the base set once and hands the
// rows here. The base set is the admin universe narrowed ONLY by the filters that have no count
// (free text, hidden, demo), through the same applyAdminFilters the table uses. Every counted
// filter is re-applied below with the predicate PostgREST runs for it there: `eq` is `===`, `is
// null` is `== null` (for the step text, the caller asks the table's own read and passes a flag),
// the tag filter is "carries this slug", and `featured` reads featured_at the way
// searchAdminPractices does.

/** The columns the counter reads from practices_ranked. */
export interface FacetBaseRow {
  id: string
  domain_id: string | null
  subcategory_id: string | null
  status: string | null
  weight_class: string | null
  created_by: string | null
  is_public: boolean | null
  is_template: boolean | null
  featured_at: string | null
  header_image: string | null
  /** The row matched the table's own `is('body', null)` read (the step text itself is not read). */
  no_body: boolean
  logs_total: number | null
}

/** `eq('logs_total', 0)`: a bigint that PostgREST may hand back as a string; null never matches. */
const neverLogged = (r: FacetBaseRow) => r.logs_total != null && Number(r.logs_total) === 0

/** One counted filter: the group it belongs to and whether a row passes it. */
type Group =
  | 'pillar' | 'subcategory' | 'status' | 'weight' | 'creator' | 'tag'
  | 'public' | 'template' | 'featured'
  | 'no_image' | 'no_body' | 'never_logged' | 'no_pillar'

function activePredicates(
  f: AdminPracticeSearchOpts,
  tagsOf: (id: string) => readonly string[],
): { group: Group; pass: (r: FacetBaseRow) => boolean }[] {
  const out: { group: Group; pass: (r: FacetBaseRow) => boolean }[] = []
  if (f.pillarId) out.push({ group: 'pillar', pass: (r) => r.domain_id === f.pillarId })
  if (f.subId) out.push({ group: 'subcategory', pass: (r) => r.subcategory_id === f.subId })
  if (f.status) out.push({ group: 'status', pass: (r) => r.status === f.status })
  if (f.weightClass) out.push({ group: 'weight', pass: (r) => r.weight_class === f.weightClass })
  if (f.creatorId) out.push({ group: 'creator', pass: (r) => r.created_by === f.creatorId })
  if (f.tag) out.push({ group: 'tag', pass: (r) => tagsOf(r.id).includes(f.tag as string) })
  if (f.isPublic !== undefined) out.push({ group: 'public', pass: (r) => r.is_public === f.isPublic })
  if (f.isTemplate !== undefined) out.push({ group: 'template', pass: (r) => r.is_template === f.isTemplate })
  if (f.featured !== undefined) out.push({ group: 'featured', pass: (r) => (r.featured_at != null) === f.featured })
  if (f.noImage) out.push({ group: 'no_image', pass: (r) => r.header_image == null })
  if (f.noBody) out.push({ group: 'no_body', pass: (r) => r.no_body })
  if (f.neverLogged) out.push({ group: 'never_logged', pass: neverLogged })
  if (f.noPillar) out.push({ group: 'no_pillar', pass: (r) => r.domain_id == null })
  return out
}

function bump(m: Map<string, number>, key: string | null | undefined, none?: string) {
  const k = key ?? none
  if (k === undefined) return
  m.set(k, (m.get(k) ?? 0) + 1)
}

/** Buckets largest first (key as the tiebreak), with the active value always present so a
 *  dropdown can still name what is selected when nothing else matches it. */
function buckets(m: Map<string, number>, selected: string | null | undefined) {
  if (selected && !m.has(selected)) m.set(selected, 0)
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

/**
 * Count every facet group minus itself over the base rows. A row that passes every active filter
 * counts in every group; a row that fails exactly one counts only in that one's group (it is what
 * changing that filter would bring in); a row that fails two or more counts nowhere.
 */
export function residualFacetCounts(
  rows: readonly FacetBaseRow[],
  tagSlugsByPractice: ReadonlyMap<string, readonly string[]>,
  filters: AdminPracticeSearchOpts,
): AdminPracticeFacets {
  const tagsOf = (id: string) => tagSlugsByPractice.get(id) ?? []
  const preds = activePredicates(filters, tagsOf)

  const pillar = new Map<string, number>()
  const subcategory = new Map<string, number>()
  const status = new Map<string, number>()
  const weight = new Map<string, number>()
  const creator = new Map<string, number>()
  const tag = new Map<string, number>()
  const flag = { public: 0, template: 0, featured: 0 }
  const computed = { no_image: 0, no_body: 0, never_logged: 0, no_pillar: 0 }

  for (const r of rows) {
    let failed: Group | null = null
    let failures = 0
    for (const p of preds) {
      if (!p.pass(r)) {
        failed = p.group
        if (++failures > 1) break
      }
    }
    if (failures > 1) continue
    const counts = (g: Group) => failures === 0 || failed === g

    if (counts('pillar')) bump(pillar, r.domain_id, '__none__')
    if (counts('subcategory')) bump(subcategory, r.subcategory_id, '__none__')
    if (counts('status')) bump(status, r.status)
    if (counts('weight')) bump(weight, r.weight_class)
    if (counts('creator')) bump(creator, r.created_by)
    if (counts('tag')) for (const slug of new Set(tagsOf(r.id))) bump(tag, slug)
    if (counts('public') && r.is_public) flag.public++
    if (counts('template') && r.is_template) flag.template++
    if (counts('featured') && r.featured_at != null) flag.featured++
    if (counts('no_image') && r.header_image == null) computed.no_image++
    if (counts('no_body') && r.no_body) computed.no_body++
    if (counts('never_logged') && neverLogged(r)) computed.never_logged++
    if (counts('no_pillar') && r.domain_id == null) computed.no_pillar++
  }

  return {
    pillar: buckets(pillar, filters.pillarId),
    subcategory: buckets(subcategory, filters.subId),
    status: buckets(status, filters.status),
    weight: buckets(weight, filters.weightClass),
    creator: buckets(creator, filters.creatorId),
    tag: buckets(tag, filters.tag),
    flag,
    computed,
  }
}
