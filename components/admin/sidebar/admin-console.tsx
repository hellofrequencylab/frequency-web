'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutTemplate,
  Palette,
  Megaphone,
  SlidersHorizontal,
  LayoutDashboard,
  FileText,
  Users,
  CircleDot,
  Trophy,
  QrCode,
  ShieldAlert,
  BarChart3,
  ChevronRight,
  ChevronLeft,
  Search,
  type LucideIcon,
} from 'lucide-react'
import { meetsAccess } from '@/lib/nav-areas'
import type { CommunityRole } from '@/lib/community-roles'
import type { StaffRole } from '@/lib/staff'
import { visibleLinks } from '@/app/(main)/admin/sections'
import { CircleSettingsModule } from '@/components/admin/modules/circle-settings-module'
import { HubSettingsModule } from '@/components/admin/modules/hub-settings-module'
import { NexusSettingsModule } from '@/components/admin/modules/nexus-settings-module'
import { EventSettingsModule } from '@/components/admin/modules/event-settings-module'
import { ModerationModule } from '@/components/admin/modules/moderation-module'
import { BroadcastsModule } from '@/components/admin/modules/broadcasts-module'
import { GamificationModule } from '@/components/admin/modules/gamification-module'
import { CrewTasksModule } from '@/components/admin/modules/crew-tasks-module'
import { MembersModule } from '@/components/admin/modules/members-module'
import { InsightsModule } from '@/components/admin/modules/insights-module'
import { RolesModule } from '@/components/admin/modules/roles-module'
import { QrGeneratorModule } from '@/components/admin/modules/qr-generator-module'
import { DemoModule } from '@/components/admin/modules/demo-module'
import { SpacesCirclesModule } from '@/components/admin/modules/spaces-circles-module'
import { ChannelsModule } from '@/components/admin/modules/channels-module'
import { EventsModule } from '@/components/admin/modules/events-module'
import { SpacesHubsModule } from '@/components/admin/modules/spaces-hubs-module'
import { SpacesNexusesModule } from '@/components/admin/modules/spaces-nexuses-module'

// The page-admin sidebar console (ADR-137 drill-down · ADR-138 the "manage" surface).
// Home lists the categories that apply for THIS viewer; tap one to drill into its
// settings; search jumps to any item. Tiers filter automatically because the manage
// links come from the role-gated admin catalog (`visibleLinks`) — a janitor (the top
// tier) sees every category populated; a host sees only what they steward. The aim:
// reach any admin surface from the sidebar, no trip to /admin.
//
// The per-page in-place settings module lives under **Basics**. As the @admin server
// slot lands, the catalog links become server-composed `modulesForSurface(...)`.

type Item =
  | { kind: 'link'; label: string; sub?: string; href: string; Icon: LucideIcon }
  | { kind: 'soon'; label: string; sub?: string; Icon: LucideIcon }

type Category = {
  key: string
  label: string
  Icon: LucideIcon
  summary?: string
  module?: ReactNode
  items: Item[]
}

// Spine categories (ADR-137) the console can populate, in order. `spaces` collects
// the global entity-management surfaces (manage all circles / channels / …); the
// rest are the spine proper. `platform` is the janitor's sensitive keys.
const CATEGORIES: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'basics', label: 'Basics', Icon: SlidersHorizontal },
  { key: 'spaces', label: 'Spaces', Icon: CircleDot },
  { key: 'people', label: 'People', Icon: Users },
  { key: 'engage', label: 'Engage', Icon: Trophy },
  { key: 'comms', label: 'Comms', Icon: Megaphone },
  { key: 'reach', label: 'Reach', Icon: QrCode },
  { key: 'safety', label: 'Safety', Icon: ShieldAlert },
  { key: 'insights', label: 'Insights', Icon: BarChart3 },
  { key: 'layout', label: 'Layout', Icon: LayoutTemplate },
  { key: 'platform', label: 'Platform', Icon: LayoutDashboard },
]

// Map an admin surface to its spine category.
function slotForHref(href: string): string {
  if (href.startsWith('/admin/moderation')) return 'safety'
  if (href.startsWith('/admin/members') || href.startsWith('/admin/roles')) return 'people'
  if (href.startsWith('/admin/dispatches') || href.startsWith('/outreach')) return 'comms'
  if (href.startsWith('/admin/gamification') || href.startsWith('/admin/crew-tasks') || href.startsWith('/programs')) return 'engage'
  if (href.startsWith('/admin/qr')) return 'reach'
  if (/^\/admin\/(engagement|intel|outcomes|insights|segments)/.test(href)) return 'insights'
  if (/^\/admin\/(circles|channels|events|hubs|nexuses)/.test(href)) return 'spaces'
  if (href === '/pages') return 'layout'
  return 'platform' // /admin overview, vera, help-gaps, ai, demo
}

export function AdminConsole({
  role,
  staffRole,
  onNavigate,
}: {
  role: CommunityRole | null
  staffRole: StaffRole | null
  onNavigate: () => void
}) {
  const pathname = usePathname()
  const [view, setView] = useState<string>('home') // 'home' | category key
  const [query, setQuery] = useState('')

  // Reset to home on route change.
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    setView('home')
    setQuery('')
  }

  const isJanitor = meetsAccess('janitor', role) || staffRole != null

  const circleSlug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null
  const hubSlug = pathname.match(/^\/hubs\/([^/]+)/)?.[1] ?? null
  const nexusSlug = pathname.match(/^\/nexuses\/([^/]+)/)?.[1] ?? null
  const eventSlug = pathname.match(/^\/events\/([^/]+)/)?.[1] ?? null

  const settingsModule = circleSlug ? (
    <CircleSettingsModule />
  ) : hubSlug ? (
    <HubSettingsModule />
  ) : nexusSlug ? (
    <NexusSettingsModule />
  ) : eventSlug ? (
    <EventSettingsModule />
  ) : null

  // Bucket the role-gated admin catalog into spine categories.
  const itemsBySlot = new Map<string, Item[]>()
  for (const l of visibleLinks(role ?? 'member', staffRole)) {
    const slot = slotForHref(l.href)
    const arr = itemsBySlot.get(slot) ?? []
    arr.push({ kind: 'link', label: l.label, sub: l.desc, href: l.href, Icon: l.Icon })
    itemsBySlot.set(slot, arr)
  }
  // Layout tuners (page-builder), still "Soon"; plus a janitor's Pages link.
  const layoutExtra: Item[] = [
    { kind: 'soon', label: 'Layout template', sub: 'Soon', Icon: LayoutTemplate },
    { kind: 'soon', label: 'Basic styles', sub: 'Soon', Icon: Palette },
    ...(isJanitor ? [{ kind: 'link' as const, label: 'Pages & content', href: '/pages', Icon: FileText }] : []),
  ]

  // Moderation: render the in-place queue (ADR-138) in place of the deep-link, when
  // the role-gated catalog grants it.
  // Deep-link → in-place ports: when the role-gated catalog includes a surface's
  // link, render its in-place module in the spine category and drop the duplicate
  // link. Adding a ported surface = one entry here.
  // `hrefs` lists the catalog links this category's in-place module(s) REPLACE (the
  // module renders, those links drop). An empty/absent `hrefs` is ADDITIVE — the
  // module heads the category above the kept links (e.g. Insights). Shown whenever the
  // viewer has a relevant link (any of `hrefs`, or any link when additive).
  const IN_PLACE: Record<string, { hrefs?: string[]; module: ReactNode; summary: string }> = {
    safety: { hrefs: ['/admin/moderation'], module: <ModerationModule />, summary: 'Reports queue' },
    comms: { hrefs: ['/admin/dispatches'], module: <BroadcastsModule />, summary: 'Broadcast' },
    engage: {
      hrefs: ['/admin/gamification', '/admin/crew-tasks'],
      module: (
        <div className="space-y-4">
          <GamificationModule />
          <CrewTasksModule />
        </div>
      ),
      summary: 'Season, awards, crew tasks',
    },
    people: {
      hrefs: ['/admin/members', '/admin/roles'],
      module: (
        <div className="space-y-4">
          <MembersModule />
          <RolesModule />
        </div>
      ),
      summary: 'Roster & roles',
    },
    insights: { module: <InsightsModule />, summary: 'Live signal' },
    reach: { module: <QrGeneratorModule />, summary: 'Generate & export' },
    platform: { hrefs: ['/admin/demo'], module: <DemoModule />, summary: 'Demo content' },
    spaces: {
      hrefs: ['/admin/circles', '/admin/channels', '/admin/events', '/admin/hubs', '/admin/nexuses'],
      module: (
        <div className="space-y-4">
          <SpacesCirclesModule />
          <ChannelsModule />
          <EventsModule />
          <SpacesHubsModule />
          <SpacesNexusesModule />
        </div>
      ),
      summary: 'Circles, channels, events, hubs, nexuses',
    },
  }

  const categories: Category[] = CATEGORIES.map((c) => {
    const raw = itemsBySlot.get(c.key) ?? []
    const inPlace = IN_PLACE[c.key]
    const hrefs = inPlace?.hrefs ?? []
    const hasInPlace =
      !!inPlace && (hrefs.length ? raw.some((it) => it.kind === 'link' && hrefs.includes(it.href)) : raw.length > 0)
    const base = hrefs.length ? raw.filter((it) => !(it.kind === 'link' && hrefs.includes(it.href))) : raw
    const items = c.key === 'layout' ? [...layoutExtra, ...base] : base
    const mod =
      c.key === 'basics' ? settingsModule ?? undefined : hasInPlace ? inPlace.module : undefined
    const summary =
      c.key === 'basics' && mod
        ? 'Name, details, status'
        : hasInPlace && mod
          ? inPlace.summary
          : items.length
            ? `${items.length} ${items.length === 1 ? 'setting' : 'settings'}`
            : undefined
    return { ...c, items, module: mod, summary }
  }).filter((c) => c.module || c.items.length > 0)

  const q = query.trim().toLowerCase()
  const searchResults: Item[] = q
    ? categories.flatMap((c) => c.items).filter((it) => it.label.toLowerCase().includes(q))
    : []

  const active = categories.find((c) => c.key === view)

  function renderItem(it: Item) {
    if (it.kind === 'soon') {
      return (
        <div key={it.label} aria-disabled className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-subtle opacity-60">
          <it.Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1">{it.label}</span>
          <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-subtle">Soon</span>
        </div>
      )
    }
    return (
      <Link
        key={it.label}
        href={it.href}
        onClick={onNavigate}
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
      >
        <it.Icon className="h-4 w-4 shrink-0 text-muted" />
        <span className="flex-1 truncate">{it.label}</span>
        {it.sub && <span className="max-w-[45%] truncate text-2xs text-subtle">{it.sub}</span>}
      </Link>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {view === 'home' ? (
        <>
          <div className="sticky top-0 z-10 bg-surface p-1.5">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated/50 px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search settings…"
                className="w-full bg-transparent text-sm text-text outline-none placeholder:text-subtle"
              />
            </div>
          </div>

          {q ? (
            <div className="p-1.5">
              {searchResults.length ? (
                searchResults.map(renderItem)
              ) : (
                <p className="px-2.5 py-6 text-center text-sm text-subtle">No settings match “{query}”.</p>
              )}
            </div>
          ) : (
            <div className="p-1.5">
              {categories.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setView(c.key)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-surface-elevated"
                >
                  <c.Icon className="h-4 w-4 shrink-0 text-primary-strong" />
                  <span className="shrink-0 text-sm font-medium text-text">{c.label}</span>
                  {c.summary && <span className="flex-1 truncate text-right text-2xs text-subtle">{c.summary}</span>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
                </button>
              ))}
            </div>
          )}
        </>
      ) : active ? (
        <>
          <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-border bg-surface px-2 py-2">
            <button
              type="button"
              onClick={() => setView('home')}
              aria-label="Back"
              className="flex items-center rounded-md p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="flex items-center gap-1.5 text-sm font-bold text-text">
              <active.Icon className="h-4 w-4 text-primary-strong" />
              {active.label}
            </span>
          </div>
          <div className="space-y-2 p-1.5">
            {active.module && <div className="px-1 py-1">{active.module}</div>}
            {active.items.map(renderItem)}
          </div>
        </>
      ) : null}
    </div>
  )
}
