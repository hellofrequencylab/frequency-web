import Link from 'next/link'
import { ArrowLeft, Blocks, Tag, AppWindow, LayoutTemplate, PanelLeft, Shapes } from 'lucide-react'
import type { App } from '@/lib/apps/types'
import type { AppSurfaceKind } from '@/lib/apps/types'

// The Loom Studio Apps-lane folder rail (LP5b, docs/LOOM-PLATFORM.md §4). A back link to the asset
// library, an "All apps" reset, smart folders by spine Category, and a filter by Surface. Navigation
// is URL-driven (?lane=apps) and preserves the search + view; presentational, no hooks.

type CategoryFacet = { category: App['category']; label: string; count: number }
type SurfaceFacet = { surface: AppSurfaceKind; label: string; count: number }
type Active = { category: string; surface: string }
type Base = { q: string; view: string }

const SURFACE_ICON: Record<AppSurfaceKind, typeof AppWindow> = {
  editor: AppWindow,
  page: LayoutTemplate,
  rail: PanelLeft,
  element: Shapes,
}

function buildHref(base: Base, patch: { category?: string; surface?: string }): string {
  const p = new URLSearchParams()
  p.set('lane', 'apps')
  if (base.q) p.set('q', base.q)
  if (base.view && base.view !== 'cards') p.set('view', base.view)
  if (patch.category) p.set('category', patch.category)
  if (patch.surface) p.set('surface', patch.surface)
  return `/admin/library?${p.toString()}`
}

function Row({
  href,
  active,
  icon,
  label,
  count,
}: {
  href: string
  active: boolean
  icon: React.ReactNode
  label: string
  count?: number
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`flex min-w-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs transition-colors sm:gap-2 sm:px-2.5 sm:text-sm ${
        active ? 'bg-primary-bg font-semibold text-primary-strong' : 'text-muted hover:bg-surface-elevated'
      }`}
    >
      <span className="shrink-0 text-subtle">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="hidden shrink-0 text-xs text-subtle sm:inline">{count}</span>}
    </Link>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 mt-4 px-2.5 text-2xs font-semibold uppercase tracking-wide text-subtle">{children}</p>
}

export function AppsRail({
  total,
  categories,
  surfaces,
  active,
  base,
}: {
  total: number
  categories: CategoryFacet[]
  surfaces: SurfaceFacet[]
  active: Active
  base: Base
}) {
  const noFilter = !active.category && !active.surface

  return (
    <nav className="space-y-0.5" aria-label="Apps folders">
      <Link
        href="/admin/library"
        className="mb-1 flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs text-subtle transition-colors hover:bg-surface-elevated hover:text-text sm:px-2.5 sm:text-sm"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Library
      </Link>

      <Row
        href={buildHref(base, {})}
        active={noFilter}
        icon={<Blocks className="h-4 w-4" />}
        label="All apps"
        count={total}
      />

      {surfaces.length > 0 && <SectionLabel>Surface</SectionLabel>}
      {surfaces.map((s) => {
        const Icon = SURFACE_ICON[s.surface]
        return (
          <Row
            key={s.surface}
            href={buildHref(base, { surface: s.surface })}
            active={active.surface === s.surface}
            icon={<Icon className="h-4 w-4" />}
            label={s.label}
            count={s.count}
          />
        )
      })}

      {categories.length > 0 && <SectionLabel>Categories</SectionLabel>}
      {categories.map((c) => (
        <Row
          key={c.category}
          href={buildHref(base, { category: c.category })}
          active={active.category === c.category}
          icon={<Tag className="h-4 w-4" />}
          label={c.label}
          count={c.count}
        />
      ))}
    </nav>
  )
}
