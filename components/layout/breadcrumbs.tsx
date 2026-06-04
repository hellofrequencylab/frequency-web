'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

// Site-wide breadcrumb trail, auto-derived from the path. Known segments get a
// canonical label (matching the nav); unknown segments (slugs) are titleized.
// Hidden on top-level routes (one segment) since there's nowhere to climb to.
// A page with a dynamic id/slug leaf can render its own <Breadcrumbs trail=…/>
// with a real name instead of relying on the auto label.
const SEGMENT_LABELS: Record<string, string> = {
  feed: 'Feed',
  circles: 'Circles',
  channels: 'Channels',
  events: 'Events',
  broadcast: 'Broadcasts',
  messages: 'Messages',
  crew: 'Dashboard',
  quests: 'Quests',
  store: 'Store',
  vault: 'Vault',
  practices: 'Practices',
  journeys: 'Journeys',
  programs: 'Programs',
  friends: 'Friends',
  partners: 'Partners',
  people: 'Directory',
  discover: 'Discover',
  topics: 'Interests',
  'the-lab': 'The Lab',
  'the-community': 'The Community',
  'the-quest': 'The Quest',
  about: 'About',
  settings: 'Settings',
  billing: 'Billing',
  notifications: 'Notifications',
  admin: 'Admin',
  demo: 'Demo Studio',
  studio: 'Demo Studio',
  pages: 'Pages',
  crm: 'CRM',
  outreach: 'Outreach',
  marketing: 'Marketing',
}

type Crumb = { href: string; label: string }

function titleize(seg: string) {
  // Don't titleize raw uuids into noise; show a tidy fallback instead.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg)) return 'Detail'
  return decodeURIComponent(seg)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function Breadcrumbs({
  trail,
  className = '',
}: {
  /** Optional explicit trail (for pages with dynamic names). Overrides auto-derivation. */
  trail?: Crumb[]
  className?: string
}) {
  const pathname = usePathname()

  // Admin carries its own wayfinding in the sub-nav (sub-nav.tsx) — a breadcrumb
  // prefix (Admin › Group) folded into the same row as the tabs — so a separate
  // site breadcrumb here would just duplicate it. Skip it on /admin unless a page
  // passes an explicit trail.
  if (!trail && pathname.startsWith('/admin')) return null

  const crumbs: Crumb[] =
    trail ??
    pathname
      .split('/')
      .filter(Boolean)
      .map((seg, i, all) => ({
        href: '/' + all.slice(0, i + 1).join('/'),
        label: SEGMENT_LABELS[seg] ?? titleize(seg),
      }))

  if (crumbs.length < 2) return null

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex flex-wrap items-center gap-1.5 text-sm text-muted mb-5 ${className}`}
    >
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          <span key={c.href} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />}
            {last ? (
              <span className="max-w-[14rem] truncate font-medium text-text" aria-current="page">
                {c.label}
              </span>
            ) : (
              <Link href={c.href} className="max-w-[11rem] truncate transition-colors hover:text-text">
                {c.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
