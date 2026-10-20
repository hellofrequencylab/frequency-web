import type { NetworkedSpace } from './discovery'
import { SPACE_KINDS, type SpaceKind } from './categories'

// THE DIRECTORY'S SECTIONS (LIVE-1018): what the Business Spaces index draws, decided in one pure place
// so the page stays a thin Server Component and the rules are testable.
//
//  - FEATURED leads an unfiltered view. The operator's picks (`directoryFeatured`) win; when none are
//    picked it falls back to the most active Spaces, and says so (`picked: false`), so the heading can
//    be honest about it.
//  - FOUNDING BUSINESSES is its own row, minus anything already featured.
//  - The RESULTS are everything the server filters matched, narrowed by the two facets the discovery
//    read does not carry (city, has-events), minus the Spaces the lead rows already show, then windowed by `show` (Show more adds a page).
//
// Founding status is a badge and a row, never a ranking input (lib/spaces/discovery.ts).

const FEATURED_MAX = 4
const FOUNDING_MAX = 4
export const SHOW_STEP = 12
const SHOW_CAP = 96

export interface DirectoryParams {
  q?: string
  subject?: string
  category?: string
  following?: string
  sort?: string
  city?: string
  events?: string
  show?: string
}

export interface DirectorySections {
  /** True when any search or filter is set, so the lead rows step aside and results come first. */
  filtering: boolean
  featured: NetworkedSpace[]
  /** False when the featured row is the most-active fallback rather than the operator's picks. */
  featuredPicked: boolean
  founding: NetworkedSpace[]
  results: NetworkedSpace[]
  /** Matches before the `show` window. */
  total: number
  /** How many cards the grid is allowed to draw (the `show` window). */
  limit: number
  hasMore: boolean
  /** Spaces per KIND across the whole directory, kinds with none left out. */
  kindCounts: { key: SpaceKind; label: string; n: number }[]
  /** Cities with at least one Space, biggest first. */
  cities: { value: string; label: string; n: number }[]
}

/** `?show=` coerced to a window: a multiple of the step, at least one step, at most the cap. */
export function showLimit(raw: string | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= SHOW_STEP) return SHOW_STEP
  return Math.min(SHOW_CAP, Math.ceil(n / SHOW_STEP) * SHOW_STEP)
}

export function isFiltering(p: DirectoryParams): boolean {
  return !!((p.q ?? '').trim() || p.subject || p.category || p.following === '1' || p.city || p.events === '1')
}

export function buildDirectorySections(
  all: readonly NetworkedSpace[],
  matched: readonly NetworkedSpace[],
  params: DirectoryParams,
): DirectorySections {
  const filtering = isFiltering(params)
  const city = (params.city ?? '').trim().toLowerCase()
  const narrowed = matched.filter(
    (s) =>
      (!city || (s.city ?? '').toLowerCase() === city) &&
      (params.events !== '1' || (s.upcomingEventCount ?? 0) > 0),
  )
  const limit = showLimit(params.show)

  const picked = all.filter((s) => s.directoryFeatured)
  const featuredPicked = picked.length > 0
  const byStanding = [...all].sort((a, b) => b.standing - a.standing || a.name.localeCompare(b.name))
  const featured = filtering ? [] : (featuredPicked ? picked : byStanding.slice(0, 3)).slice(0, FEATURED_MAX)
  const featuredIds = new Set(featured.map((s) => s.id))
  const founding = filtering
    ? []
    : byStanding.filter((s) => s.isFoundingBusiness && !featuredIds.has(s.id)).slice(0, FOUNDING_MAX)

  const kindTally = new Map<SpaceKind, number>()
  const cityTally = new Map<string, { label: string; n: number }>()
  for (const s of all) {
    kindTally.set(s.kind, (kindTally.get(s.kind) ?? 0) + 1)
    const c = s.city?.trim()
    if (c) {
      const key = c.toLowerCase()
      const cur = cityTally.get(key)
      cityTally.set(key, { label: cur?.label ?? c, n: (cur?.n ?? 0) + 1 })
    }
  }

  // The lead rows are not repeated in the grid beneath them.
  const leadIds = new Set([...featured, ...founding].map((s) => s.id))
  const rest = narrowed.filter((s) => !leadIds.has(s.id))

  return {
    filtering,
    featured,
    featuredPicked,
    founding,
    results: rest.slice(0, limit),
    total: rest.length,
    limit,
    hasMore: rest.length > limit && limit < SHOW_CAP,
    kindCounts: SPACE_KINDS.map((k) => ({ key: k.key, label: k.label, n: kindTally.get(k.key) ?? 0 })).filter(
      (k) => k.n > 0,
    ),
    cities: [...cityTally.entries()]
      .map(([value, v]) => ({ value, label: v.label, n: v.n }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
      .slice(0, 12),
  }
}
