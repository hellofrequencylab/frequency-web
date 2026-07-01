import Link from 'next/link'
import { Images, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { LIBRARY_KINDS } from '@/lib/library/types'
import { resolveActiveScope } from '@/lib/library/scope'
import {
  searchLibraryAssets,
  kindCounts,
  categoryFacets,
  listCollections,
  type LibrarySort,
  type LibraryCollection,
} from '@/lib/library/store'
import { LibraryUploader } from './library-uploader'
import { LoomGrid } from './loom-grid'
import { LoomRail } from './loom-rail'
import { VeraWizard } from './vera-wizard'

// Loom Studio — the admin surface for The Loom asset library. A left folder rail (All / by
// Type / by Category / Collections) drives a searchable, paginated grid with per-asset editing
// and bulk actions (add to collection, set category, tag, archive, delete). Scope is role-aware
// (resolveActiveScope): today staff manage the Frequency master library; per-space and personal
// Looms plug into the same seam next (docs/BUILD-LIST.md → The Loom).
export const dynamic = 'force-dynamic'

const SORTS: { value: LibrarySort; label: string }[] = [
  { value: 'new', label: 'Newest' },
  { value: 'old', label: 'Oldest' },
  { value: 'title', label: 'Title' },
  { value: 'size', label: 'Largest' },
]

const PAGE_SIZE = 48

/** A compact page list: 1 … around-current … last. */
function pageWindow(current: number, total: number): (number | 'gap')[] {
  const keep = new Set<number>([1, total, current, current - 1, current + 1])
  const sorted = [...keep].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  let prev = 0
  for (const n of sorted) {
    if (n - prev > 1) out.push('gap')
    out.push(n)
    prev = n
  }
  return out
}

export default async function LoomStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; category?: string; collection?: string; sort?: string; page?: string }>
}) {
  await requireAdmin('janitor')
  const sp = await searchParams
  const scope = await resolveActiveScope()

  const q = (sp.q ?? '').trim()
  const kind = LIBRARY_KINDS.includes(sp.kind as (typeof LIBRARY_KINDS)[number]) ? sp.kind! : ''
  const category = (sp.category ?? '').trim()
  const collectionId = (sp.collection ?? '').trim()
  const sort = (SORTS.find((s) => s.value === sp.sort)?.value ?? 'new') as LibrarySort
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)

  const [pageResult, counts, categories, collections] = scope
    ? await Promise.all([
        searchLibraryAssets({
          spaceId: scope.spaceId,
          q,
          kind: kind || undefined,
          category: category || undefined,
          collectionId: collectionId || undefined,
          sort,
          page,
          pageSize: PAGE_SIZE,
        }),
        kindCounts(scope.spaceId),
        categoryFacets(scope.spaceId),
        listCollections(scope.spaceId),
      ])
    : [
        { items: [], total: 0 },
        { total: 0, byKind: {} as Record<string, number> },
        [] as { category: string; count: number }[],
        [] as LibraryCollection[],
      ]

  const assets = pageResult.items
  const totalPages = Math.max(1, Math.ceil(pageResult.total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)

  const activeCollection = collections.find((c) => c.id === collectionId) ?? null
  const activeLabel = activeCollection
    ? activeCollection.title
    : category || (kind ? kind : 'All assets')

  const pageHref = (n: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (kind) params.set('kind', kind)
    if (category) params.set('category', category)
    if (collectionId) params.set('collection', collectionId)
    if (sort !== 'new') params.set('sort', sort)
    if (n > 1) params.set('page', String(n))
    const qs = params.toString()
    return qs ? `/admin/library?${qs}` : '/admin/library'
  }

  return (
    <AdminTemplate
      title="Loom Studio"
      icon={Images}
      eyebrow={scope ? scope.label : 'The Loom'}
      description="Manage the asset library: organize into folders, search, edit, and reuse across the site."
      actions={<LibraryUploader />}
      actionsAlign="end"
      width="wide"
    >
      <AdminSection>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <LoomRail
            total={counts.total}
            byKind={counts.byKind}
            categories={categories}
            collections={collections}
            active={{ kind, category, collectionId }}
            base={{ q, sort }}
          />

          <div className="min-w-0 flex-1">
            <VeraWizard />

            {/* Context + search */}
            <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 className="font-display text-lg uppercase text-text">{activeLabel}</h2>
              <span className="text-sm text-subtle">
                {pageResult.total} asset{pageResult.total === 1 ? '' : 's'}
              </span>
            </div>

            {/* Search + sort (GET form; server re-renders). Hidden inputs keep the active folder. */}
            <form className="mb-6 flex flex-wrap items-end gap-3" action="/admin/library" method="get">
              {category && <input type="hidden" name="category" value={category} />}
              {collectionId && <input type="hidden" name="collection" value={collectionId} />}
              <label className="flex min-w-[220px] flex-1 flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Search</span>
                <span className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                  <input
                    type="search"
                    name="q"
                    defaultValue={q}
                    placeholder="Search title, category…"
                    className="w-full rounded-2xl border border-border bg-surface py-2 pl-9 pr-3 text-sm"
                  />
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Type</span>
                <select name="kind" defaultValue={kind} className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm">
                  <option value="">All</option>
                  {LIBRARY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Sort</span>
                <select name="sort" defaultValue={sort} className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm">
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded-2xl border border-border-strong px-4 py-2 text-sm font-semibold text-text hover:bg-surface-elevated"
              >
                Apply
              </button>
            </form>

            {assets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-strong px-6 py-16 text-center">
                <Images className="mx-auto mb-3 h-8 w-8 text-subtle" aria-hidden />
                <p className="text-base text-muted">
                  {q || kind || category || collectionId ? 'No assets match.' : 'No assets yet.'}
                </p>
                <p className="mt-1 text-sm text-subtle">
                  {q || kind || category || collectionId
                    ? 'Try clearing the search or picking another folder.'
                    : 'Upload your first image to start the library.'}
                </p>
              </div>
            ) : (
              <>
                <LoomGrid assets={assets} collections={collections} activeCollectionId={collectionId || undefined} />

                {totalPages > 1 && (
                  <nav className="mt-8 flex flex-wrap items-center justify-center gap-1" aria-label="Pagination">
                    {currentPage > 1 ? (
                      <Link href={pageHref(currentPage - 1)} className="rounded-xl border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-elevated" aria-label="Previous page">
                        <ChevronLeft className="h-4 w-4" />
                      </Link>
                    ) : (
                      <span className="rounded-xl border border-border px-3 py-1.5 text-sm text-subtle opacity-50">
                        <ChevronLeft className="h-4 w-4" />
                      </span>
                    )}

                    {pageWindow(currentPage, totalPages).map((nn, i) =>
                      nn === 'gap' ? (
                        <span key={`gap-${i}`} className="px-2 text-subtle">
                          …
                        </span>
                      ) : (
                        <Link
                          key={nn}
                          href={pageHref(nn)}
                          aria-current={nn === currentPage ? 'page' : undefined}
                          className={`min-w-[2.25rem] rounded-xl border px-3 py-1.5 text-center text-sm ${
                            nn === currentPage
                              ? 'border-primary bg-primary text-on-primary'
                              : 'border-border text-text hover:bg-surface-elevated'
                          }`}
                        >
                          {nn}
                        </Link>
                      ),
                    )}

                    {currentPage < totalPages ? (
                      <Link href={pageHref(currentPage + 1)} className="rounded-xl border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-elevated" aria-label="Next page">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    ) : (
                      <span className="rounded-xl border border-border px-3 py-1.5 text-sm text-subtle opacity-50">
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    )}
                  </nav>
                )}

                <p className="mt-3 text-center text-xs text-subtle">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{(currentPage - 1) * PAGE_SIZE + assets.length} of{' '}
                  {pageResult.total}
                </p>
              </>
            )}
          </div>
        </div>
      </AdminSection>
    </AdminTemplate>
  )
}
