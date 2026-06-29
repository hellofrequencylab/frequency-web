import { cache } from 'react'
import { headers } from 'next/headers'
import type { FacetOption } from '@/components/ui/facet-dropdown'
import {
  searchAdminPractices,
  countAdminPractices,
  searchAdminFacets,
  listSubcategories,
  type AdminPracticeSearchOpts,
  type AdminPracticeSort,
  type AdminPracticeSearchResult,
} from '@/lib/practices'
import { getPillars } from '@/lib/pillars'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FacetRailData } from '@/app/(main)/admin/content/practices/practices-facets'
import type { LibraryRow, LibraryFilter, LibraryPagination } from '@/app/(main)/admin/content/practices/practices-table'

// The shared data behind the admin practices curation workspace (/admin/content/practices). The
// stats band and the faceted library are BOTH layout modules now (ADR-270/294), and both derive
// from the same filter spec + facet read — so this ONE request-cached resolver runs the reads once
// no matter how the operator arranges the blocks (mirrors lib/admin/journeys-context.ts).
//
// The faceted library is URL-driven: filters / sort / cursor / page live in the page's
// searchParams, which never reach a nested module. They DO reach this resolver through the
// `x-search` request header the proxy stamps on every route (proxy.ts) — the same seam the member
// /practices library module uses. So the library converts cleanly to a module rather than staying
// hand-rendered in the page (the §D faceted-library nuance: threading is clean, no PageModules
// infra change). Access is gated by the page (requireAdmin); this is the read.

const PAGE_SIZE = 50

// The on-page sort vocabulary → the read layer's AdminPracticeSort + direction. The page exposes a
// "sort + direction" control; here we fold the two title directions (az/za) and the implied
// directions of the other signals into the server's sort enum.
function resolveSort(sortParam: string | undefined, dir: string | undefined): AdminPracticeSort {
  const asc = dir === 'asc'
  switch (sortParam) {
    case 'title': return asc ? 'az' : 'za'
    case 'new': return asc ? 'old' : 'new'
    case 'logs': return 'logs'
    case 'adopters': return 'adopters'
    default: return 'score'
  }
}

function str(v: string | null | undefined): string | undefined {
  const s = v ?? undefined
  return s && s.trim() ? s.trim() : undefined
}
function flag(v: string | null | undefined): boolean | undefined {
  const s = str(v)
  if (s === 'true') return true
  if (s === 'false') return false
  return undefined
}

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved', pending: 'Pending', draft: 'Draft', rejected: 'Rejected', archived: 'Archived',
}
const WEIGHT_LABELS: Record<string, string> = { light: 'Light', standard: 'Standard', heavy: 'Heavy' }

export interface AdminPracticesContext {
  /** Headline counts for the StatCard band. */
  stats: {
    inLibrary: number
    publicCount: number
    pendingCount: number
    featuredCount: number
    neverLogged: number
  }
  /** Everything the library block renders. */
  library: {
    rows: LibraryRow[]
    filter: LibraryFilter
    total: number
    showingFrom: number
    showingTo: number
    pagination: LibraryPagination
    facetRail: FacetRailData
    hasActiveFilter: boolean
  }
}

export const getAdminPracticesContext = cache(async (): Promise<AdminPracticesContext> => {
  // The page's facets live in the URL; read them from the header the proxy stamps (proxy.ts) —
  // searchParams are a page prop a nested module never receives.
  const sp = new URLSearchParams((await headers()).get('x-search') ?? '')

  const sortParam = str(sp.get('sort'))
  const dir = str(sp.get('dir'))
  const sort = resolveSort(sortParam, dir)
  const page = Math.max(1, Number(str(sp.get('page'))) || 1)
  const cursor = str(sp.get('cursor')) ?? null

  // The shared filter spec — the SAME shape searchAdminPractices, countAdminPractices, and the
  // bulk-on-filtered action all consume, so "act on what I'm looking at" runs the identical query.
  const filterOpts: AdminPracticeSearchOpts = {
    q: str(sp.get('q')) ?? null,
    pillarId: str(sp.get('pillar')) ?? null,
    subId: str(sp.get('sub')) ?? null,
    status: str(sp.get('status')) ?? null,
    weightClass: str(sp.get('weight')) ?? null,
    creatorId: str(sp.get('creator')) ?? null,
    tag: str(sp.get('tag')) ?? null,
    isPublic: flag(sp.get('public')),
    isTemplate: flag(sp.get('template')),
    featured: flag(sp.get('featured')),
    noImage: flag(sp.get('noImage')),
    noBody: flag(sp.get('noBody')),
    neverLogged: flag(sp.get('neverLogged')),
    noPillar: flag(sp.get('noPillar')),
    includeHidden: true,
  }

  const [libraryResult, total, facets, pillars, subcategories]: [
    AdminPracticeSearchResult, number, Awaited<ReturnType<typeof searchAdminFacets>>,
    Awaited<ReturnType<typeof getPillars>>, Awaited<ReturnType<typeof listSubcategories>>,
  ] = await Promise.all([
    searchAdminPractices({ ...filterOpts, sort, cursor, page, pageSize: PAGE_SIZE }),
    countAdminPractices(filterOpts),
    searchAdminFacets({ includeHidden: true }),
    getPillars(),
    listSubcategories(),
  ])

  const pendingCount = facets.status.find((s) => s.key === 'pending')?.count ?? 0

  // Resolve the facet rail's option labels (the counts come back keyed by id/slug). Creator +
  // tag labels need a small extra read; everything else maps from the taxonomy we already have.
  const admin = createAdminClient()
  const creatorIds = facets.creator.map((c) => c.key).slice(0, 200)
  const tagSlugs = facets.tag.map((t) => t.key)
  const [{ data: creatorRows }, { data: tagRows }] = await Promise.all([
    creatorIds.length
      ? admin.from('profiles').select('id, display_name, handle').in('id', creatorIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; handle: string | null }[] }),
    tagSlugs.length
      ? admin.from('practice_tag_defs').select('slug, label').in('slug', tagSlugs)
      : Promise.resolve({ data: [] as { slug: string; label: string }[] }),
  ])

  const pillarName = new Map(pillars.map((p) => [p.id, p.name]))
  const subName = new Map(subcategories.map((s) => [s.id, s.name]))
  const creatorName = new Map(
    ((creatorRows ?? []) as { id: string; display_name: string | null; handle: string | null }[]).map((r) => [
      r.id,
      r.display_name ?? (r.handle ? `@${r.handle}` : 'Unknown'),
    ]),
  )
  const tagLabel = new Map(((tagRows ?? []) as { slug: string; label: string }[]).map((r) => [r.slug, r.label]))

  const withCount = (label: string, count: number) => `${label} (${count})`
  const facetRail: FacetRailData = {
    pillar: facets.pillar
      .filter((f) => f.key !== '__none__' && pillarName.has(f.key))
      .map((f): FacetOption => ({ value: f.key, label: withCount(pillarName.get(f.key)!, f.count) })),
    subcategory: facets.subcategory
      .filter((f) => f.key !== '__none__' && subName.has(f.key))
      .map((f): FacetOption => ({ value: f.key, label: withCount(subName.get(f.key)!, f.count) })),
    status: facets.status.map((f): FacetOption => ({
      value: f.key,
      label: withCount(STATUS_LABELS[f.key] ?? f.key, f.count),
    })),
    weight: facets.weight.map((f): FacetOption => ({
      value: f.key,
      label: withCount(WEIGHT_LABELS[f.key] ?? f.key, f.count),
    })),
    creator: facets.creator
      .filter((f) => creatorName.has(f.key))
      .map((f): FacetOption => ({ value: f.key, label: withCount(creatorName.get(f.key)!, f.count) })),
    tag: facets.tag.map((f): FacetOption => ({
      value: f.key,
      label: withCount(tagLabel.get(f.key) ?? f.key, f.count),
    })),
    computed: facets.computed,
  }

  const rows: LibraryRow[] = libraryResult.rows.map((p) => ({
    id: p.id,
    title: p.title,
    // A practice with no member creator (created_by null) is one of Frequency's first-party
    // "house practices" — render the creator as "Frequency", not "System" (owner fix, ADR-438).
    creator: p.created_by == null ? 'Frequency' : (p.creator?.display_name ?? p.creator?.handle ?? 'Unknown'),
    isHouse: p.created_by == null,
    status: p.status ?? 'approved',
    adopters: p.adopters,
    logs_30d: p.logs_30d,
    logs_total: p.logs_total,
    score: p.score,
    created_at: p.created_at,
    is_public: p.is_public,
    is_template: p.is_template,
    featured: !!p.featured_at,
    weight_class: p.weight_class ?? null,
  }))

  // The "showing N of M" window + the pagination affordance differ by sort (the read layer's
  // documented keyset/offset split): keyset gets a "Load more" cursor href; offset gets prev/next.
  const isKeyset = sort === 'score'
  const showingFrom = total === 0 ? 0 : isKeyset ? 1 : (page - 1) * PAGE_SIZE + 1
  const showingTo = isKeyset ? rows.length : Math.min(page * PAGE_SIZE, (page - 1) * PAGE_SIZE + rows.length)

  // Build a paging href that preserves every filter/sort param and swaps only the cursor/page.
  const allParams: Record<string, string> = {}
  for (const [k, v] of sp.entries()) if (v) allParams[k] = v
  function pageHref(changes: Record<string, string | null>): string {
    const params = new URLSearchParams(allParams)
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    const s = params.toString()
    return s ? `/admin/content/practices?${s}` : '/admin/content/practices'
  }

  const pagination: LibraryPagination = isKeyset
    ? {
        kind: 'cursor',
        moreHref: libraryResult.nextCursor ? pageHref({ cursor: libraryResult.nextCursor }) : null,
      }
    : {
        kind: 'page',
        page,
        pageCount: libraryResult.pageCount,
        prevHref: page > 1 ? pageHref({ page: String(page - 1), cursor: null }) : null,
        nextHref: page < libraryResult.pageCount ? pageHref({ page: String(page + 1), cursor: null }) : null,
      }

  const filter: LibraryFilter = { ...filterOpts }
  const hasActiveFilter =
    !!filterOpts.q || !!filterOpts.pillarId || !!filterOpts.subId || !!filterOpts.status ||
    !!filterOpts.weightClass || !!filterOpts.creatorId || !!filterOpts.tag ||
    filterOpts.isPublic !== undefined || filterOpts.isTemplate !== undefined || filterOpts.featured !== undefined ||
    !!filterOpts.noImage || !!filterOpts.noBody || !!filterOpts.neverLogged || !!filterOpts.noPillar

  return {
    stats: {
      inLibrary: facets.status.reduce((n, s) => n + s.count, 0),
      publicCount: facets.flag.public,
      pendingCount,
      featuredCount: facets.flag.featured,
      neverLogged: facets.computed.never_logged,
    },
    library: { rows, filter, total, showingFrom, showingTo, pagination, facetRail, hasActiveFilter },
  }
})
