'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { adminGroupLabelForPath } from '@/app/(main)/admin/sections'

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

  // Admin pages live under a UI "group" (Platform, Community, …) that isn't a URL
  // segment, so the plain path-derived trail would skip it. Inject it so the trail
  // reflects the IA — e.g. Admin › Platform › Demo Studio. The group crumb has no
  // index page, so it's rendered as plain text (href '').
  const adminTrail = (): Crumb[] => {
    const leaf = pathname.split('/').filter(Boolean).slice(-1)[0]
    const group = adminGroupLabelForPath(pathname)
    const t: Crumb[] = [{ href: '/admin', label: 'Admin' }]
    if (group) t.push({ href: '', label: group })
    t.push({ href: '', label: SEGMENT_LABELS[leaf] ?? titleize(leaf) })
    return t
  }

  const crumbs: Crumb[] =
    trail ??
    (pathname.startsWith('/admin') && pathname !== '/admin'
      ? adminTrail()
      : pathname
          .split('/')
          .filter(Boolean)
          .map((seg, i, all) => ({
            href: '/' + all.slice(0, i + 1).join('/'),
            label: SEGMENT_LABELS[seg] ?? titleize(seg),
          })))

  if (crumbs.length < 2) return null

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex flex-wrap items-center gap-1.5 text-sm text-muted mb-5 ${className}`}
    >
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          <span key={`${i}-${c.label}`} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />}
            {last ? (
              <span className="max-w-[14rem] truncate font-medium text-text" aria-current="page">
                {c.label}
              </span>
            ) : c.href ? (
              <Link href={c.href} className="max-w-[11rem] truncate transition-colors hover:text-text">
                {c.label}
              </Link>
            ) : (
              <span className="max-w-[11rem] truncate">{c.label}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
