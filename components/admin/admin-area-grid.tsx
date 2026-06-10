import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import type { AdminLink } from '@/app/(main)/admin/sections'

// The "areas of focus" card grid shared by all three domain dashboards. One card per
// admin surface the viewer can reach, in the launchpad's soft-surface style. Pass a
// flat `links` list (Programs / Growth) for a single grid, or `sections` (Operations)
// to bucket the cards under titled SectionHeaders. Role filtering happens upstream —
// only render links the viewer may use.

function AreaCard({ href, label, desc, Icon }: AdminLink) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl bg-surface-elevated/60 p-4 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-primary-strong">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-semibold text-text">
          {label}
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        <span className="mt-0.5 block text-xs text-muted">{desc}</span>
      </span>
    </Link>
  )
}

function CardGrid({ links }: { links: readonly AdminLink[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {links.map((l) => (
        <AreaCard key={l.href} {...l} />
      ))}
    </div>
  )
}

/** A single flat grid of area cards (Programs / Growth). */
export function AdminAreaGrid({ links }: { links: readonly AdminLink[] }) {
  return <CardGrid links={links} />
}

/** Area cards bucketed under titled sections (Operations). An empty section label
 *  renders the grid with no header. */
export function AdminAreaSections({
  sections,
}: {
  sections: { section: string; links: AdminLink[] }[]
}) {
  return (
    <div className="space-y-6">
      {sections.map((s, i) => (
        <div key={s.section || `section-${i}`}>
          {s.section && <SectionHeader title={s.section} count={s.links.length} />}
          <CardGrid links={s.links} />
        </div>
      ))}
    </div>
  )
}
