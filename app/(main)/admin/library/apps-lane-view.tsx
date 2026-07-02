import Link from 'next/link'
import { Images, Search, LayoutGrid, List } from 'lucide-react'
import { AdminTemplate, AdminSection, RailGrid } from '@/components/templates'
import {
  appsAsLibraryItems,
  appCategoryFacets,
  appSurfaceFacets,
  resolveAppPreview,
} from '@/lib/apps/app-registry'
import type { AppSurfaceKind } from '@/lib/apps/types'
import { AppsRail } from '@/components/admin/library/apps-rail'
import { AppsLane, type AppCard } from '@/components/admin/library/apps-lane'

// The Loom Studio Apps lane view (LP5b, docs/LOOM-PLATFORM.md §4). Rendered when ?lane=apps. Server
// Component: it resolves the App catalog + previews (which reach the render layers), then hands plain
// rows + preview nodes to the client lane. Staff-gated by the page (requireAdmin) that mounts it.

const APP_SURFACES: readonly AppSurfaceKind[] = ['editor', 'page', 'rail', 'element']
const APP_VIEWS: { value: 'cards' | 'list'; label: string; Icon: typeof LayoutGrid }[] = [
  { value: 'cards', label: 'Cards', Icon: LayoutGrid },
  { value: 'list', label: 'List', Icon: List },
]

export async function AppsLaneView({
  q = '',
  category = '',
  surface = '',
  view: rawView = '',
}: {
  q?: string
  category?: string
  surface?: string
  view?: string
}) {
  const all = appsAsLibraryItems()
  const categories = appCategoryFacets(all)
  const surfaces = appSurfaceFacets(all)

  const query = q.trim().toLowerCase()
  const activeSurface = (APP_SURFACES as readonly string[]).includes(surface) ? (surface as AppSurfaceKind) : ''
  const activeCategory = categories.some((c) => c.category === category) ? category : ''
  const view = APP_VIEWS.find((v) => v.value === rawView)?.value ?? 'cards'

  let filtered = all
  if (activeCategory) filtered = filtered.filter((i) => i.category === activeCategory)
  if (activeSurface) filtered = filtered.filter((i) => i.surfaces.includes(activeSurface))
  if (query) {
    filtered = filtered.filter((i) =>
      `${i.title} ${i.description ?? ''} ${i.categoryLabel}`.toLowerCase().includes(query),
    )
  }

  const items: AppCard[] = await Promise.all(
    filtered.map(async (i) => ({ ...i, preview: await resolveAppPreview(i.id) })),
  )

  const activeLabel = activeCategory
    ? (categories.find((c) => c.category === activeCategory)?.label ?? 'Apps')
    : activeSurface
      ? `${surfaces.find((s) => s.surface === activeSurface)?.label} apps`
      : 'All apps'

  const hrefWith = (patch: Record<string, string | undefined>) => {
    const cur: Record<string, string> = { lane: 'apps' }
    if (q) cur.q = q
    if (activeCategory) cur.category = activeCategory
    if (activeSurface) cur.surface = activeSurface
    if (view !== 'cards') cur.view = view
    const merged = { ...cur, ...patch }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '') continue
      params.set(k, v)
    }
    return `/admin/library?${params.toString()}`
  }

  return (
    <AdminTemplate
      title="Loom Studio"
      icon={Images}
      eyebrow="Apps"
      description="Browse the App catalog: every code feature The Loom can place, configure, and version. Source is code, indexed read-only."
      width="wide"
    >
      <AdminSection>
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-lg uppercase text-text">{activeLabel}</h2>
            <span className="text-sm text-subtle">
              {items.length} App{items.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Search (GET form). Hidden inputs preserve the active folder + view. */}
          <form className="flex flex-1 flex-wrap items-center justify-end gap-2" action="/admin/library" method="get">
            <input type="hidden" name="lane" value="apps" />
            {activeCategory && <input type="hidden" name="category" value={activeCategory} />}
            {activeSurface && <input type="hidden" name="surface" value={activeSurface} />}
            {view !== 'cards' && <input type="hidden" name="view" value={view} />}
            <span className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search Apps…"
                className="w-full rounded-2xl border border-border bg-surface py-2 pl-9 pr-3 text-sm"
              />
            </span>
            <button
              type="submit"
              className="rounded-2xl border border-border-strong px-4 py-2 text-sm font-semibold text-text hover:bg-surface-elevated"
            >
              Apply
            </button>

            <div className="ml-1 flex items-center rounded-2xl border border-border p-0.5">
              {APP_VIEWS.map(({ value, label, Icon }) => (
                <Link
                  key={value}
                  href={hrefWith({ view: value === 'cards' ? undefined : value })}
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

        <RailGrid
          menu={
            <AppsRail
              total={all.length}
              categories={categories}
              surfaces={surfaces}
              active={{ category: activeCategory, surface: activeSurface }}
              base={{ q, view }}
            />
          }
        >
          <AppsLane items={items} view={view} />
        </RailGrid>
      </AdminSection>
    </AdminTemplate>
  )
}
