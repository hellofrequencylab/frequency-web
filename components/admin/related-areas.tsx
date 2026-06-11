import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { relatedGroups, type DomainKey } from '@/app/(main)/admin/sections'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'

// The cross-link strip on an area dashboard (ADR-233 IA): the neighboring workspaces an
// operator most often moves to from here (declared per area in sections.ts `related`),
// filtered to the ones the viewer can enter. Server component (no hooks).
//
//   <RelatedAreas current="crm" role={role} webRole={webRole} staffRole={staffRole} />

export function RelatedAreas({
  current,
  role,
  webRole = 'none',
  staffRole = null,
}: {
  current: DomainKey
  role: CommunityRole
  webRole?: WebRole
  staffRole?: StaffRole | null
}) {
  const groups = relatedGroups(current, role, webRole, staffRole)
  if (groups.length === 0) return null

  return (
    <section className="border-t border-border/70 pt-7 sm:pt-8">
      <h2 className="text-lg font-bold text-text">Related areas</h2>
      <p className="mt-1 text-sm text-muted">Jump to a neighboring workspace.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <Link
            key={g.key}
            href={g.href}
            className="group flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-surface-elevated motion-reduce:transition-none"
          >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
              <g.Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-sm font-semibold text-text">
                {g.label}
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">{g.blurb}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
