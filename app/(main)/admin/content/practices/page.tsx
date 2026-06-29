import { BookOpen, Inbox, Star, Globe, ExternalLink, Activity } from 'lucide-react'
import Link from 'next/link'
import { requireAdmin } from '@/lib/admin/guard'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import type { FacetOption } from '@/components/ui/facet-dropdown'
import {
  searchAdminPractices,
  countAdminPractices,
  searchAdminFacets,
  listSubcategories,
  type AdminPracticeSearchOpts,
  type AdminPracticeSort,
} from '@/lib/practices'
import { getPillars } from '@/lib/pillars'
import { createAdminClient } from '@/lib/supabase/admin'
import { NewPracticeButton } from '@/components/studio/practice/new-practice-button'
import { PracticeReviewButtons } from '../content-controls'
import { PracticesTable, type LibraryRow, type LibraryFilter } from './practices-table'
import { PracticesFacets, type FacetRailData } from './practices-facets'
import {
  PracticeSearchBox,
  PracticeSortControl,
  PracticeSavedViews,
} from './practices-controls'

// Library curation, Phase 1 "Scale it" (ADR-438, PRACTICE-LIBRARY §7). The whole filter / sort /
// page state lives in the URL (searchParams), which drives the SERVER fetch (searchAdminPractices
// + searchAdminFacets + countAdminPractices) — no 200-row cap, no client-side filtering. The page
// recomposes on DashboardTemplate: a StatCard metric band, an in-page facet rail (admin routes are
// rail='none', so this is a left column in the body), and the management table. The pending review
// queue stays its own status-filtered query above the library. The default (score) sort paginates
// by keyset ("Load more"); the alternate sorts page with prev/next.

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

function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return s && s.trim() ? s.trim() : undefined
}
function flag(v: string | string[] | undefined): boolean | undefined {
  const s = str(v)
  if (s === 'true') return true
  if (s === 'false') return false
  return undefined
}

export default async function AdminContentPracticesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin('host', { staff: 'community' })
  const sp = await searchParams

  const sortParam = str(sp.sort)
  const dir = str(sp.dir)
  const sort = resolveSort(sortParam, dir)
  const page = Math.max(1, Number(str(sp.page)) || 1)
  const cursor = str(sp.cursor) ?? null

  // The shared filter spec — the SAME shape searchAdminPractices, countAdminPractices, and the
  // bulk-on-filtered action all consume, so "act on what I'm looking at" runs the identical query.
  const filterOpts: AdminPracticeSearchOpts = {
    q: str(sp.q) ?? null,
    pillarId: str(sp.pillar) ?? null,
    subId: str(sp.sub) ?? null,
    status: str(sp.status) ?? null,
    weightClass: str(sp.weight) ?? null,
    creatorId: str(sp.creator) ?? null,
    tag: str(sp.tag) ?? null,
    isPublic: flag(sp.public),
    isTemplate: flag(sp.template),
    featured: flag(sp.featured),
    noImage: flag(sp.noImage),
    noBody: flag(sp.noBody),
    neverLogged: flag(sp.neverLogged),
    noPillar: flag(sp.noPillar),
    includeHidden: true,
  }

  const [pendingResult, libraryResult, total, facets, pillars, subcategories] = await Promise.all([
    searchAdminPractices({ status: 'pending', sort: 'new', pageSize: PAGE_SIZE, includeHidden: true }),
    searchAdminPractices({ ...filterOpts, sort, cursor, page, pageSize: PAGE_SIZE }),
    countAdminPractices(filterOpts),
    searchAdminFacets({ includeHidden: true }),
    getPillars(),
    listSubcategories(),
  ])

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

  const STATUS_LABELS: Record<string, string> = {
    approved: 'Approved', pending: 'Pending', draft: 'Draft', rejected: 'Rejected', archived: 'Archived',
  }
  const WEIGHT_LABELS: Record<string, string> = { light: 'Light', standard: 'Standard', heavy: 'Heavy' }

  // Build an option list, label = "<name> (<count>)", dropping buckets with no name or no count.
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

  const pending = pendingResult.rows
  const rows: LibraryRow[] = libraryResult.rows.map((p) => ({
    id: p.id,
    title: p.title,
    creator: p.creator?.display_name ?? p.creator?.handle ?? 'System',
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
  function pageHref(changes: Record<string, string | null>): string {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) {
      const value = Array.isArray(v) ? v[0] : v
      if (value != null && value !== '') params.set(k, value)
    }
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    const s = params.toString()
    return s ? `?${s}` : '/admin/content/practices'
  }

  const pagination = isKeyset
    ? {
        kind: 'cursor' as const,
        moreHref: libraryResult.nextCursor ? pageHref({ cursor: libraryResult.nextCursor }) : null,
      }
    : {
        kind: 'page' as const,
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

  return (
    <DashboardTemplate
      eyebrow="Content"
      title="Practices"
      description="The practice library, ranked by real usage. Filter by any signal, then tune what is public, what is a starter template, and what gets featured."
      width="wide"
      actions={<NewPracticeButton label="Add practice" />}
      stats={
        <>
          <StatCard label="In the library" value={facets.status.reduce((n, s) => n + s.count, 0)} icon={BookOpen} href="/practices" />
          <StatCard label="Public" value={facets.flag.public} icon={Globe} />
          <StatCard label="Awaiting review" value={pendingResult.total} icon={Inbox} />
          <StatCard label="Featured" value={facets.flag.featured} icon={Star} />
          <StatCard label="Never logged" value={facets.computed.never_logged} icon={Activity} detail="a gap to fix" />
        </>
      }
    >
      {/* Review queue — member-proposed practices waiting on a decision. */}
      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-bold tracking-tight text-text">Review queue</h2>
          <span className="text-xs font-medium tabular-nums text-subtle">{pendingResult.total}</span>
        </div>
        {pending.length === 0 ? (
          <EmptyState
            variant="cleared"
            title="Nothing waiting"
            description="New member proposals land here for a decision."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="divide-y divide-border/50">
              {pending.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/practices/${p.id}`} className="flex items-center gap-1.5 text-sm font-medium text-text hover:underline">
                      <span className="truncate">{p.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-subtle" />
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      by {p.creator?.display_name ?? p.creator?.handle ?? 'Unknown'} · {p.adopters} adopters · {p.logs_total} logs
                    </p>
                  </div>
                  <PracticeReviewButtons id={p.id} />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* The library — facet rail beside the server-driven table. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <PracticeSearchBox />
          <PracticeSortControl />
          <PracticeSavedViews />
        </div>

        <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
          <PracticesFacets data={facetRail} />
          <div className="min-w-0">
            {rows.length === 0 ? (
              <EmptyState
                variant={hasActiveFilter ? 'no-results' : 'first-use'}
                icon={hasActiveFilter ? undefined : BookOpen}
                title={hasActiveFilter ? 'No practices match these filters' : 'No practices yet'}
                description={
                  hasActiveFilter
                    ? 'Try removing a filter, or clear them all to see the whole library.'
                    : 'Practices appear here as the library fills in.'
                }
              />
            ) : (
              <PracticesTable
                rows={rows}
                filter={filter}
                total={total}
                showingFrom={showingFrom}
                showingTo={showingTo}
                pagination={pagination}
              />
            )}
          </div>
        </div>
      </section>
    </DashboardTemplate>
  )
}
