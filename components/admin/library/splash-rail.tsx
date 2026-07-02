import Link from 'next/link'
import { ArrowLeft, LayoutTemplate, Layers, Sparkles, Globe, QrCode } from 'lucide-react'

// The Loom Studio Splash-lane folder rail (docs/LOOM-PLATFORM.md §4). A back link to the asset
// library, an "All splashes" reset, and smart folders that split the lane into its two jobs: the
// CATALOG (templates) and the GOVERNANCE list (live splashes → micro-sites / QR). Navigation is
// URL-driven (?lane=splash&section=...) and preserves the search + view; presentational, no hooks.

type Section = '' | 'templates' | 'live' | 'micro' | 'qr'
type Active = { section: Section }
type Base = { q: string; view: string }

type Counts = { templates: number; micro: number; qr: number }

function buildHref(base: Base, patch: { section?: Section }): string {
  const p = new URLSearchParams()
  p.set('lane', 'splash')
  if (base.q) p.set('q', base.q)
  if (base.view && base.view !== 'cards') p.set('view', base.view)
  if (patch.section) p.set('section', patch.section)
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

export function SplashRail({ counts, active, base }: { counts: Counts; active: Active; base: Base }) {
  const noFilter = !active.section
  return (
    <nav className="space-y-0.5" aria-label="Splash folders">
      <Link
        href="/admin/library"
        className="mb-1 flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs text-subtle transition-colors hover:bg-surface-elevated hover:text-text sm:px-2.5 sm:text-sm"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Library
      </Link>

      <Row
        href={buildHref(base, {})}
        active={noFilter}
        icon={<Sparkles className="h-4 w-4" />}
        label="All splashes"
        count={counts.templates + counts.micro + counts.qr}
      />

      <SectionLabel>Catalog</SectionLabel>
      <Row
        href={buildHref(base, { section: 'templates' })}
        active={active.section === 'templates'}
        icon={<LayoutTemplate className="h-4 w-4" />}
        label="Templates"
        count={counts.templates}
      />

      <SectionLabel>Live</SectionLabel>
      <Row
        href={buildHref(base, { section: 'live' })}
        active={active.section === 'live'}
        icon={<Layers className="h-4 w-4" />}
        label="All live"
        count={counts.micro + counts.qr}
      />
      <Row
        href={buildHref(base, { section: 'micro' })}
        active={active.section === 'micro'}
        icon={<Globe className="h-4 w-4" />}
        label="Micro-sites"
        count={counts.micro}
      />
      <Row
        href={buildHref(base, { section: 'qr' })}
        active={active.section === 'qr'}
        icon={<QrCode className="h-4 w-4" />}
        label="QR splashes"
        count={counts.qr}
      />
    </nav>
  )
}
