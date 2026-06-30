// The PURE core of the member-viewer block (components/people/member-viewer): the
// text/facet filter, the sort, and the page/cap math that drive the master-detail
// browser. NO React, NO Supabase, NO Next imports — just data in, data out — so the
// list logic is deterministic and trivially unit-tested (member-viewer.test.ts), and
// the client island stays a thin shell over it. The block can also run server-driven
// (onQueryChange): then the host pre-filters and the viewer renders what it is given.
//
// Naming + voice (docs/NAMING.md, docs/CONTENT-VOICE.md): this module holds no
// member-facing copy, only logic; every visible string lives in the components.

/** A single chip/select facet the search bar offers. Client-side filter matches a row's
 *  `badges` (the facet `value`) by default; a server-driven host reads the selection via
 *  `onQueryChange` and pre-filters instead. */
export interface Facet {
  /** Stable key, also the search-param name a server-driven host would use. */
  key: string
  /** The control label (e.g. "Tier"). Plain, sentence case, no em dashes. */
  label: string
  options: { value: string; label: string }[]
}

/** One row in the left list. `detail` may be embedded for an eager right pane, or omitted
 *  and lazy-loaded via `MemberViewer`'s `loadDetail`. */
export interface MemberSummary {
  id: string
  handle: string
  displayName: string
  avatarUrl?: string | null
  online?: boolean
  /** Facet-matchable tags (tier, lifecycle, region…). The client facet filter tests these. */
  badges?: string[]
  /** One-line under the name in the list (and searchable). */
  headline?: string
  /** Compact "label · value" stats for the list row / card meta. */
  stats?: { label: string; value: string }[]
  /** Optional embedded detail (skips the lazy load for this row). */
  detail?: MemberDetail
}

/** A right-pane action. Either a link (`href`) or a callback (`onSelect`); the viewer
 *  renders Connect / Message / Open Profile by default and merges these. */
export interface MemberAction {
  key: string
  label: string
  icon?: string
  href?: string
  onSelect?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
}

/** The rich right-pane model. Every rich field is optional: a host omits what it cannot
 *  source cleanly (never invent it), and the viewer renders only what is present. */
export interface MemberDetail {
  avatarUrl?: string | null
  displayName: string
  handle: string
  contact?: { email?: string; phone?: string; links?: { label: string; href: string }[] }
  latestActivity?: { label: string; when: string; href?: string }[]
  engagementStats?: { label: string; value: string; hint?: string }[]
  /** The canonical profile link; defaults to `/people/${handle}`. */
  profileHref?: string
  actions?: MemberAction[]
}

/** A field key the list can sort by. `name` and `handle` sort the row's own fields; any
 *  other key sorts on a matching `stats` entry's numeric-or-string value. */
export interface SortSpec {
  key: 'name' | 'handle' | string
  direction: 'asc' | 'desc'
}

/** The live query the viewer applies (or hands to a server-driven host via onQueryChange). */
export interface MemberQuery {
  /** Free text; matches name + handle + headline, case-insensitive. */
  text?: string
  /** facetKey -> selected value (empty/absent = no filter for that facet). */
  facets?: Record<string, string>
  sort?: SortSpec
}

const DEFAULT_PAGE_SIZE = 15
const MIN_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 20

/** Clamp a requested page size into the supported 10..20 window (default 15). Pure. */
export function clampPageSize(size: number | undefined): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) return DEFAULT_PAGE_SIZE
  return Math.max(MIN_PAGE_SIZE, Math.min(MAX_PAGE_SIZE, Math.round(size)))
}

/** Does a row match the free-text needle? Matches name + handle + headline, case-insensitive.
 *  A blank/whitespace needle matches everything. Pure. */
export function matchesText(member: MemberSummary, text: string | undefined): boolean {
  const needle = (text ?? '').trim().toLowerCase()
  if (!needle) return true
  const hay = [member.displayName, member.handle, member.headline ?? ''].join(' ').toLowerCase()
  return hay.includes(needle)
}

/** Does a row pass every selected facet? A facet whose selection is empty/absent imposes no
 *  filter; a selected value must appear in the row's `badges`. Pure. */
export function matchesFacets(member: MemberSummary, facets: Record<string, string> | undefined): boolean {
  if (!facets) return true
  const badges = member.badges ?? []
  for (const value of Object.values(facets)) {
    if (!value) continue
    if (!badges.includes(value)) return false
  }
  return true
}

/** The numeric or lowercased-string value a row offers for a sort key. `name`/`handle` read the
 *  row's own fields; any other key reads the matching `stats` entry (by label OR a normalized key).
 *  Returns '' when absent so missing values sort last under asc. Pure. */
function sortValue(member: MemberSummary, key: string): string | number {
  if (key === 'name') return member.displayName.toLowerCase()
  if (key === 'handle') return member.handle.toLowerCase()
  const stat = (member.stats ?? []).find(
    (s) => s.label === key || s.label.toLowerCase().replace(/\s+/g, '_') === key,
  )
  if (!stat) return ''
  const n = Number(stat.value.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) && stat.value.trim() !== '' ? n : stat.value.toLowerCase()
}

/** Sort a COPY of the rows by the spec (stable; ties keep input order). No spec = input order. Pure. */
export function sortMembers(members: MemberSummary[], sort: SortSpec | undefined): MemberSummary[] {
  if (!sort) return members.slice()
  const dir = sort.direction === 'desc' ? -1 : 1
  return members
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const va = sortValue(a.m, sort.key)
      const vb = sortValue(b.m, sort.key)
      let cmp: number
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb
      else cmp = String(va).localeCompare(String(vb))
      if (cmp !== 0) return cmp * dir
      return a.i - b.i // stable tiebreak
    })
    .map((x) => x.m)
}

export interface ApplyResult {
  /** The filtered + sorted rows visible up to `page * pageSize`. */
  visible: MemberSummary[]
  /** The full filtered + sorted set (its length is the match count). */
  filtered: MemberSummary[]
  /** Total rows that matched the query (before the page cap). */
  total: number
  /** True when more matched rows remain beyond `visible` (drives "Show more"). */
  hasMore: boolean
}

/**
 * The one entry point the client island calls: filter (text + facets), sort, then page/cap.
 * `page` is 1-based and clamps to >= 1; `pageSize` is clamped to 10..20. Pure + deterministic,
 * so the same inputs always yield the same window. When a host runs server-driven, it can skip
 * the filter/sort here (pass an already-narrowed list and no query) and still get the paging math.
 */
export function applyQuery(
  members: MemberSummary[],
  query: MemberQuery,
  page: number,
  pageSize: number,
): ApplyResult {
  const filtered = sortMembers(
    (members ?? []).filter((m) => matchesText(m, query.text) && matchesFacets(m, query.facets)),
    query.sort,
  )
  const size = clampPageSize(pageSize)
  const safePage = Math.max(1, Math.floor(page) || 1)
  const cap = safePage * size
  const visible = filtered.slice(0, cap)
  return {
    visible,
    filtered,
    total: filtered.length,
    hasMore: filtered.length > visible.length,
  }
}

/** The default profile link for a member (the viewer's Open Profile target). Pure. */
export function profileHrefFor(member: { handle: string; profileHref?: string }): string {
  return member.profileHref ?? `/people/${member.handle}`
}
