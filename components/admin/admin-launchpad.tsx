import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { visibleDashboards } from '@/app/(main)/admin/sections'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'

// The Overview launchpad: every admin surface the viewer can reach, collapsed into
// the three operator dashboards (ADR-171) — Community / Insights / Platform — with
// each dashboard's suites beneath it. This is the "every feature has a home"
// guarantee made visible: a host sees only Community, a janitor sees all three, and
// nothing is hidden in a route with no link.

export function AdminLaunchpad({
  role,
  webRole = 'none',
  staffRole = null,
}: {
  role: CommunityRole
  /** STAFF axis (web_role, ADR-208) — gates the admin/janitor-min suites. */
  webRole?: WebRole
  staffRole?: StaffRole | null
}) {
  const dashboards = visibleDashboards(role, webRole, staffRole).map((d) => ({
    ...d,
    groups: d.groups
      // The Overview card grid is for *navigating* — drop the self-link to /admin.
      .map((g) => ({ ...g, links: g.links.filter((l) => !l.exact) }))
      .filter((g) => g.links.length > 0),
  })).filter((d) => d.groups.length > 0)

  return (
    <div className="space-y-10">
      {dashboards.map((dash) => (
        <section key={dash.key} className="space-y-4">
          <div className="flex items-start gap-3 border-b border-border pb-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-primary-strong">
              <dash.Icon className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-text">{dash.label}</h2>
              <p className="text-sm text-muted">{dash.blurb}</p>
            </div>
          </div>

          <div className="space-y-5">
            {dash.groups.map((group) => (
              <div key={group.key} className="space-y-2.5">
                <div>
                  <h3 className="text-sm font-bold text-text">{group.label}</h3>
                  <p className="text-xs text-muted">{group.blurb}</p>
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
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
