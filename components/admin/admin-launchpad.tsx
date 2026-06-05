import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { visibleGroups } from '@/app/(main)/admin/sections'
import type { CommunityRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'

// The Overview launchpad: every admin surface the viewer can reach, grouped by
// the same sections that drive the nav. This is the "every feature has a home"
// guarantee made visible — a host sees a couple of groups, a janitor sees all of
// them, and nothing is hidden in a route with no link.

export function AdminLaunchpad({ role, staffRole = null }: { role: CommunityRole; staffRole?: StaffRole | null }) {
  const groups = visibleGroups(role, staffRole).map((g) => ({
    ...g,
    // The Overview card grid is for *navigating* — drop the self-link to /admin.
    links: g.links.filter((l) => !l.exact),
  })).filter((g) => g.links.length > 0)

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2.5">
          <div>
            <h2 className="text-base font-bold text-text">{group.label}</h2>
            <p className="text-sm text-muted">{group.blurb}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.links.map(({ href, label, desc, Icon }) => (
              <Link
                key={href}
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
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
