'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The Space profile tab row, rendered by the (profile) route-group layout.
//
// WHY THIS IS A CLIENT COMPONENT: the profile chrome lives in a shared layout that Next.js does
// NOT re-render when you navigate between its child tabs (a layout renders once per instance and is
// reused across its children). So the ACTIVE tab can't be computed from a request-time signal in the
// layout (the old code derived it from the `x-pathname` header, which went stale on soft navigation
// and could even blank the whole header). `usePathname()` reads the live client route on every
// navigation, so the active tab is always correct without re-rendering the server layout.
//
// The markup mirrors DetailTemplate's own tab row (same tokens/geometry) so the profile reads
// identical to every other Detail page.
export interface SpaceProfileTab {
  href: string
  label: string
}

export function SpaceProfileTabs({ tabs }: { tabs: SpaceProfileTab[] }) {
  const pathname = usePathname()
  if (tabs.length === 0) return null

  // The first tab (About) targets the profile index; it is active only on an exact match. Every other
  // tab is active when the path is its href or a deeper sub-path of it. Comparing on the pathname alone
  // (no query) keeps the match stable.
  const indexHref = tabs[0]?.href

  return (
    <nav className="mt-4 -mb-px flex items-center gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active =
          tab.href === indexHref
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-primary-bg text-primary-strong'
                : 'text-muted hover:bg-surface-elevated hover:text-text'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
