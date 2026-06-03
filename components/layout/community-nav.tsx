'use client'

import Link from 'next/link'
import { NAV_AREAS, meetsAccess, type NavAccess } from '@/lib/nav-areas'
import type { CommunityRole } from '@/lib/community-roles'
import { AREA_ICONS, FALLBACK_AREA_ICON } from '@/components/layout/nav-icons'

// The "Broadcast bar": a slim horizontal tab strip under the header — the
// time-sensitive comms loop (Dispatches · Messages · Events). Feed is the home
// anchor and lives at the top of the left rail; this strip is the day's live
// channels. Derived straight from NAV_AREAS (placement === 'community'), so it
// stays in lockstep with the sidebar + permission grid. Areas the viewer can't
// reach render muted (same convention as the sidebar). The strip scrolls
// horizontally on narrow screens so it works as the mobile community nav too.
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
          <Link
            key={area.key}
            href={area.href}
            aria-current={active ? 'page' : undefined}
            className={`relative inline-flex items-center gap-2 px-3 whitespace-nowrap rounded-md text-sm font-medium transition-colors ${
              active
                ? 'text-primary-strong'
                : 'text-muted hover:text-text hover:bg-surface-elevated'
            }`}
          >
            <Icon
              className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-primary-strong' : 'text-subtle'}`}
              strokeWidth={active ? 2.5 : 2}
            />
            {area.label}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
