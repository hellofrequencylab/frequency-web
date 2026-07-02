'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The Space profile MENU row, rendered by the (profile) route-group layout. Three item kinds share it:
//   - Home + custom sub-pages (path links; active state below)
//   - SECTION ANCHORS into the Home page (`/spaces/x#offerings`): the pre-populated menu derived from
//     the page's own feature blocks. Never "active" (the pathname carries no hash).
//   - the operator's ADMIN links (Manage / CRM), right-aligned past a hairline, never shown to visitors.
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

export function SpaceProfileTabs({
  tabs,
  adminTabs = [],
}: {
  tabs: SpaceProfileTab[]
  /** Operator-only back-end links (Manage / CRM), right-aligned after a hairline. Empty for visitors. */
  adminTabs?: SpaceProfileTab[]
}) {
  const pathname = usePathname()
  if (tabs.length === 0 && adminTabs.length === 0) return null

  // The first tab (Home) targets the profile index; it is active only on an exact match. An anchor
  // item (href carries a hash) is never active. Every other path tab is active when the path is its
  // href or a deeper sub-path of it. Comparing on the pathname alone (no query/hash) keeps it stable.
  const indexHref = tabs[0]?.href
  const isActive = (tab: SpaceProfileTab): boolean => {
    if (tab.href.includes('#')) return false
    if (tab.href === indexHref) return pathname === tab.href
    return pathname === tab.href || pathname.startsWith(`${tab.href}/`)
  }

  const itemClasses = (active: boolean) =>
    `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-primary-bg text-primary-strong' : 'text-muted hover:bg-surface-elevated hover:text-text'
    }`

  return (
    <nav className="mt-4 -mb-px flex items-center gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = isActive(tab)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={itemClasses(active)}
          >
            {tab.label}
          </Link>
        )
      })}
      {adminTabs.length > 0 && (
        <span className="ml-auto flex items-center gap-1 border-l border-border pl-2">
          {adminTabs.map((tab) => (
            <Link key={tab.href} href={tab.href} className={itemClasses(isActive(tab))}>
              {tab.label}
            </Link>
          ))}
        </span>
      )}
    </nav>
  )
}
