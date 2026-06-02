'use client'

import Link from 'next/link'
import { NAV_AREAS, meetsAccess, type NavAccess } from '@/lib/nav-areas'
import type { CommunityRole } from '@/lib/community-roles'
import { AREA_ICONS, FALLBACK_AREA_ICON } from '@/components/layout/nav-icons'

// The "Broadcast bar": a slim horizontal tab strip under the header. Feed is the
// anchor (always available, set apart and a touch bolder), followed by the
// time-sensitive comms loop (Dispatches · Messages · Events). Derived straight
// from NAV_AREAS (placement === 'community'), so it stays in lockstep with the
// sidebar + permission grid. Areas the viewer can't reach render muted (same
// convention as the sidebar). The strip scrolls horizontally on narrow screens
// so it works as the mobile community nav too.
const COMMUNITY_AREAS = NAV_AREAS.filter((a) => a.placement === 'community')

export function CommunityNav({
  role,
  isActive,
  permissions,
}: {
  role: CommunityRole
  isActive: (href: string) => boolean
  /** Per-area access overrides (janitor-set); merged over code defaults. */
  permissions?: Record<string, NavAccess>
}) {
  return (
    <nav
      aria-label="Broadcast"
      className="sticky top-0 z-20 shrink-0 flex items-stretch gap-0.5 h-11 px-3 bg-surface/80 backdrop-blur-sm border-b border-border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {COMMUNITY_AREAS.map((area) => {
        const Icon = AREA_ICONS[area.key] ?? FALLBACK_AREA_ICON
        const access = permissions?.[area.key] ?? area.defaultAccess
        // Feed is the bar's anchor: a little bolder, and split off from the
        // Dispatches/Messages/Events comms group by a hairline.
        const isFeed = area.key === 'feed'

        if (!meetsAccess(access, role)) {
          return (
            <span
              key={area.key}
              aria-disabled="true"
              title="You don't have access to this yet"
              className="inline-flex items-center gap-2 px-3 text-sm font-medium text-subtle opacity-50 cursor-not-allowed select-none whitespace-nowrap"
            >
              <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
              {area.label}
            </span>
          )
        }

        const active = isActive(area.href)
        return (
          <div key={area.key} className="flex items-stretch">
            <Link
              href={area.href}
              aria-current={active ? 'page' : undefined}
              className={`relative inline-flex items-center gap-2 px-3 whitespace-nowrap rounded-md transition-colors ${
                isFeed ? 'text-sm font-semibold' : 'text-sm font-medium'
              } ${
                active
                  ? 'text-primary-strong'
                  : isFeed
                    ? 'text-text hover:bg-surface-elevated'
                    : 'text-muted hover:text-text hover:bg-surface-elevated'
              }`}
            >
              <Icon
                className={`w-[18px] h-[18px] shrink-0 ${
                  active ? 'text-primary-strong' : isFeed ? 'text-text' : 'text-subtle'
                }`}
                strokeWidth={active || isFeed ? 2.5 : 2}
              />
              {area.label}
              {active && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
              )}
            </Link>
            {isFeed && (
              <span aria-hidden="true" className="my-2 mx-1.5 w-px self-stretch bg-border" />
            )}
          </div>
        )
      })}
    </nav>
  )
}
