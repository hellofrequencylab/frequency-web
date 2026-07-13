import Link from 'next/link'
import { Images, Search, ChevronLeft, ChevronRight, LayoutGrid, Grid2x2, List, Sparkles } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { LIBRARY_KINDS } from '@/lib/library/types'
import { resolveActiveScope } from '@/lib/library/scope'
import {
  searchLibraryAssets,
  ensureCatalogElements,
  kindCounts,
  categoryFacets,
  listCollections,
  getLibraryAsset,
  SPACES_COLLECTION_SLUG,
  type LibrarySort,
  type LibraryCollection,
  type LibraryGalleryItem,
} from '@/lib/library/store'
import { matchLibraryAssets, similarLibraryAssets } from '@/lib/library/embeddings'
import { recraftConfigured } from '@/lib/loom/recraft'
import { RailGrid } from '@/components/templates'
import { LibraryUploader } from './library-uploader'
import { LoomGrid, type LoomView } from './loom-grid'
import { LoomRail } from './loom-rail'
import { CreateStudio } from './create-studio'
import { AppsLaneView } from './apps-lane-view'
import { SplashLaneView } from './splash-lane-view'
import { splashTemplates } from '@/lib/library/splash-registry'
import { IconsLaneView } from './icons-lane-view'
import { SequenceLaneView } from './sequence-lane-view'

// Loom Studio — the admin surface for The Loom asset library. A full-width header (create +
// context + search + sort + view mode) sits above two vertically-aligned columns: a folder rail
// (All / Type / Category / Collections) and the asset grid, with per-asset editing + bulk actions.
// Scope is role-aware (resolveActiveScope): staff manage the Frequency master library today.
export const dynamic = 'force-dynamic'

const SORTS: { value: LibrarySort; label: string }[] = [
  { value: 'new', label: 'Newest' },
  { value: 'old', label: 'Oldest' },
  { value: 'title', label: 'Title' },
  { value: 'size', label: 'Largest' },
  { value: 'relevant', label: 'Most relevant' },
]

const VIEWS: { value: LoomView; label: string; Icon: typeof LayoutGrid }[] = [
  { value: 'cards', label: 'Cards', Icon: LayoutGrid },
  { value: 'compact', label: 'Compact', Icon: Grid2x2 },
  { value: 'list', label: 'List', Icon: List },
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
  searchParams: Promise<{
    q?: string
    kind?: string
    category?: string
    collection?: string
    sort?: string
    view?: string
    page?: string
    similar?: string
    lane?: string
    surface?: string
    section?: string
    edit?: string
  }>
}) {
  const ctx = await requireAdmin('janitor')
  const sp = await searchParams

  // The Apps lane (LP5b, docs/LOOM-PLATFORM.md §4): the code-drawn App catalog, indexed read-only.
  // A code-backed lane, so it has its own catalog + preview resolver (no DB scope), like elements.
  if ((sp.lane ?? '') === 'apps') {
    return <AppsLaneView q={sp.q} category={sp.category} surface={sp.surface} view={sp.view} />
  }

  // The Splash lane (docs/LOOM-PLATFORM.md §4, docs/PAGE-FRAMEWORK.md §10): CATALOGS splash templates
  // + GOVERNS the live splashes (public.pages micro-sites ∪ qr_codes splashes). Its edit affordances
  // DEEP-LINK OUT to the real editor — the Loom never becomes the splash block editor.
  if ((sp.lane ?? '') === 'splash') {
    return <SplashLaneView q={sp.q} section={sp.section} view={sp.view} />
  }

  // The Icons lane (docs/ICONS.md §Loom, ADR-505): indexes the installed @iconify-json sets read-only
  // (license + count + samples) and previews the house palette. Icons are code, so the lane governs +
  // documents; it never edits an icon.
  if ((sp.lane ?? '') === 'icons') {
    return <IconsLaneView />
  }

  // The Onboarding flows lane (docs/LOOM-PLATFORM.md §3): CREATE / EDIT / PUBLISH / VERSION managed
  // onboarding flows (library_assets kind='sequence'), feeding the resolver + runner that were already
  // built and dormant. Edits the SequenceDef config only (Layer-2 data), never a Puck block tree.
  if ((sp.lane ?? '') === 'sequence') {
    return <SequenceLaneView q={sp.q} editId={sp.edit} />
  }

  const scope = await resolveActiveScope()
  // Auto-add: reconcile the code element catalog into the master library so any newly-added
  // code-drawn element (element-catalog.ALL_ELEMENTS) shows up here without a hand-written seed
  // migration. Idempotent + fail-safe (never throws); only for a scope the viewer can manage.
  if (scope?.canManage) await ensureCatalogElements(scope.spaceId)
  const recraftEnabled = recraftConfigured()

  const q = (sp.q ?? '').trim()
  const kind = LIBRARY_KINDS.includes(sp.kind as (typeof LIBRARY_KINDS)[number]) ? sp.kind! : ''
  const category = (sp.category ?? '').trim()
  const collectionId = (sp.collection ?? '').trim()
  const similarId = (sp.similar ?? '').trim()
  const sort = (SORTS.find((s) => s.value === sp.sort)?.value ?? 'new') as LibrarySort
  const view = (VIEWS.find((v) => v.value === sp.view)?.value ?? 'cards') as LoomView
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)

  const [counts, categories, collections] = scope
    ? await Promise.all([kindCounts(scope.spaceId), categoryFacets(scope.spaceId), listCollections(scope.spaceId)])
    : [
        { total: 0, byKind: {} as Record<string, number> },
        [] as { category: string; count: number }[],
        [] as LibraryCollection[],
      ]

  // The master "Spaces" collection (Importer v2 #6) groups seeded Spaces' OWN images, which live under
  // their space_id, not the root's. When it is the active folder, browse it CROSS-SPACE so those
  // other-space assets appear (a normal collection stays scoped to the root Loom).
  const spacesCollection = collections.find((c) => c.slug === SPACES_COLLECTION_SLUG) ?? null
  const crossSpaceCollection = !!collectionId && collectionId === spacesCollection?.id

  // Main result. Three modes: "similar to X" (semantic neighbours), "most relevant" (semantic
  // ranked by the query), or the normal paginated keyword/facet browse. Semantic modes are a
  // single page and fall back to the keyword path when AI is off / nothing is embedded yet.
  let assets: LibraryGalleryItem[] = []
  let total = 0
  let paginated = false
  let similarOf: LibraryGalleryItem | null = null

  if (scope) {
    if (similarId) {
      ;[assets, similarOf] = await Promise.all([
        similarLibraryAssets(scope.spaceId, similarId, PAGE_SIZE),
        getLibraryAsset(scope.spaceId, similarId),
      ])
      total = assets.length
    } else if (sort === 'relevant' && q) {
      assets = await matchLibraryAssets(scope.spaceId, q, {
        kind: kind || undefined,
        limit: PAGE_SIZE,
        profileId: ctx.profileId,
      })
      total = assets.length
      if (assets.length === 0) {
        // AI off or nothing embedded → graceful keyword fallback.
        const r = await searchLibraryAssets({ spaceId: scope.spaceId, q, kind: kind || undefined, category: category || undefined, collectionId: collectionId || undefined, crossSpace: crossSpaceCollection, page, pageSize: PAGE_SIZE })
        assets = r.items
        total = r.total
        paginated = true
      }
    } else {
      const r = await searchLibraryAssets({
        spaceId: scope.spaceId,
        q,
        kind: kind || undefined,
        category: category || undefined,
        collectionId: collectionId || undefined,
        crossSpace: crossSpaceCollection,
        sort,
        page,
        pageSize: PAGE_SIZE,
      })
      assets = r.items
      total = r.total
      paginated = true
    }
  }

  const pageResult = { items: assets, total }
  const totalPages = paginated ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1
  const currentPage = Math.min(page, totalPages)

  const activeCollection = collections.find((c) => c.id === collectionId) ?? null
  const activeLabel = similarOf
    ? `Similar to "${similarOf.title}"`
    : activeCollection
      ? activeCollection.title
      : category || (kind ? kind : 'All assets')

  // One param builder for every link (pagination, view toggle) — preserves the active folder + search.
  const hrefWith = (patch: Record<string, string | number | undefined>) => {
    const cur: Record<string, string> = {}
    if (q) cur.q = q
    if (kind) cur.kind = kind
    if (category) cur.category = category
    if (collectionId) cur.collection = collectionId
    if (sort !== 'new') cur.sort = sort
    if (view !== 'cards') cur.view = view
    const merged = { ...cur, ...patch }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '' || v === 0) continue
      params.set(k, String(v))
    }
    const qs = params.toString()
    return qs ? `/admin/library?${qs}` : '/admin/library'
  }
  const pageHref = (n: number) => hrefWith({ page: n > 1 ? n : undefined })

  // Cross-lane discovery: the Splash lane lives behind ?lane=splash, so a top-level search (or a
  // template/flow type filter) would otherwise miss its code-backed catalog. Surface matching splash
  // templates as a small labeled strip that links INTO the lane. Read-only + additive; the DB grid
  // below is untouched (docs/LOOM-PLATFORM.md §4).
  const splashLaneMatches =
    q || kind === 'template' || kind === 'flow'
      ? splashTemplates().filter(
          (t) =>
            (!kind || t.kind === kind) &&
            (!q || `${t.title} ${t.description}`.toLowerCase().includes(q.toLowerCase())),
        )
      : []

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
        {/* Header section — spans both columns, so the rail + grid align beneath it. */}
        <div className="mb-6 space-y-4">
          <CreateStudio recraftEnabled={recraftEnabled} />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex items-baseline gap-2">
              <h2 className="font-display text-lg uppercase text-text">{activeLabel}</h2>
              <span className="text-sm text-subtle">
                {pageResult.total} asset{pageResult.total === 1 ? '' : 's'}
              </span>
              {similarOf && (
                <Link href="/admin/library" className="text-sm font-medium text-primary-strong hover:underline">
                  Clear
                </Link>
              )}
            </div>

            {/* Search + type + sort (GET form). Hidden inputs preserve the active folder + view. */}
            <form className="flex flex-1 flex-wrap items-center justify-end gap-2" action="/admin/library" method="get">
              {category && <input type="hidden" name="category" value={category} />}
              {collectionId && <input type="hidden" name="collection" value={collectionId} />}
              {view !== 'cards' && <input type="hidden" name="view" value={view} />}
              <span className="relative min-w-[180px] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Search title, category…"
                  className="w-full rounded-2xl border border-border bg-surface py-2 pl-9 pr-3 text-sm"
                />
              </span>
              <select name="kind" defaultValue={kind} aria-label="Type" className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm">
                <option value="">All types</option>
                {LIBRARY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <select name="sort" defaultValue={sort} aria-label="Sort" className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm">
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-2xl border border-border-strong px-4 py-2 text-sm font-semibold text-text hover:bg-surface-elevated"
              >
                Apply
              </button>

              {/* View mode (links; cards is primary/default) */}
              <div className="ml-1 flex items-center rounded-2xl border border-border p-0.5">
                {VIEWS.map(({ value, label, Icon }) => (
                  <Link
                    key={value}
                    href={hrefWith({ view: value === 'cards' ? undefined : value, page: undefined })}
                    aria-label={`${label} view`}
                    aria-current={view === value ? 'true' : undefined}
                    className={`rounded-[14px] p-1.5 ${
                      view === value ? 'bg-primary text-on-primary' : 'text-subtle hover:bg-surface-elevated'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                ))}
              </div>
            </form>
          </div>
        </div>

        {/* Mini menu (left) + card grid (right) — the shared RailGrid pattern, mobile-first. */}
        <RailGrid
          menu={
            <LoomRail
              total={counts.total}
              byKind={counts.byKind}
              categories={categories}
              collections={collections}
              active={{ kind, category, collectionId }}
              base={{ q, sort, view }}
            />
          }
        >
          <div>
            {splashLaneMatches.length > 0 && (
              <div className="mb-6 rounded-2xl border border-border bg-surface-elevated/40 p-4">
                <div className="mb-3 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary-strong" aria-hidden />
                  <p className="font-display text-xs uppercase tracking-wide text-subtle">From the Splash lane</p>
                  <span className="text-xs text-subtle">{splashLaneMatches.length}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {splashLaneMatches.map((t) => (
                    <Link
                      key={t.id}
                      href={`/admin/library?lane=splash&section=templates&q=${encodeURIComponent(t.title)}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm text-text hover:bg-surface-elevated"
                    >
                      <span className="truncate">{t.title}</span>
                      <span className="shrink-0 text-2xs uppercase tracking-wide text-subtle">{t.kind}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
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
                <LoomGrid assets={assets} collections={collections} activeCollectionId={collectionId || undefined} view={view} recraftEnabled={recraftEnabled} />

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
                  Showing {(currentPage - 1) * PAGE_SIZE + 1} to {(currentPage - 1) * PAGE_SIZE + assets.length} of{' '}
                  {pageResult.total}
                </p>
              </>
            )}
          </div>
        </RailGrid>
      </AdminSection>
    </AdminTemplate>
  )
}
