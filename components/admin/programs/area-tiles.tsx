import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import type { AdminLink } from '@/app/(main)/admin/sections'

// Shared launchpad tiles for the Programs workspace tabs (the soft-surface entry cards,
// matching the domain-dashboard grammar). Role filtering happens upstream in groupLinks.
export function AreaTiles({ links }: { links: readonly AdminLink[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="group flex items-start gap-3 rounded-2xl bg-surface-elevated/60 p-4 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-primary-strong">
            <l.Icon className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-sm font-semibold text-text">
              {l.label}
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
            <span className="mt-0.5 block text-xs text-muted">{l.desc}</span>
          </span>
        </Link>
      ))}
    </div>
  )
}
