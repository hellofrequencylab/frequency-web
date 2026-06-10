import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { visibleGroups } from '@/app/(main)/admin/sections'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'

// The Home "jump to" — the three operator DOMAINS (Programs / Operations / Growth)
// as prominent cards, each fanning out to its own dashboard. Home is the exec
// dashboard; this is its primary navigation down into the three domains. Role-
// filtered: a domain with no surface the viewer can reach drops out (a host may see
// only Operations + a thin Programs; a janitor sees all three). The flat per-suite
// launchpad it replaced is gone — each domain now owns its own areas-of-focus grid.

export function AdminLaunchpad({
  role,
  webRole = 'none',
  staffRole = null,
}: {
  role: CommunityRole
  /** STAFF axis (web_role, ADR-208) — gates the admin/janitor-min surfaces. */
  webRole?: WebRole
  staffRole?: StaffRole | null
}) {
  const domains = visibleGroups(role, webRole, staffRole)

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {domains.map((domain) => (
        <Link
          key={domain.key}
          href={domain.href}
          className="group flex flex-col gap-3 rounded-2xl bg-surface-elevated/60 p-5 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-primary-strong">
              <domain.Icon className="h-5 w-5" />
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-text">{domain.label}</h3>
            <p className="mt-0.5 text-sm text-muted">{domain.blurb}</p>
          </div>
          <p className="mt-auto text-xs font-medium text-subtle">
            {domain.links.length} {domain.links.length === 1 ? 'area' : 'areas'}
          </p>
        </Link>
      ))}
    </div>
  )
}
