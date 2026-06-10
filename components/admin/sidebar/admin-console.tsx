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
  ArrowUpRight,
  Search,
  type LucideIcon,
} from 'lucide-react'
import type { CommunityRole } from '@/lib/community-roles'
import { isStaff, type WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/staff'
import { visibleLinks } from '@/app/(main)/admin/sections'
import { CircleSettingsModule } from '@/components/admin/modules/circle-settings-module'
import { HubSettingsModule } from '@/components/admin/modules/hub-settings-module'
import { NexusSettingsModule } from '@/components/admin/modules/nexus-settings-module'
import { EventSettingsModule } from '@/components/admin/modules/event-settings-module'
import { QrGeneratorModule } from '@/components/admin/modules/qr-generator-module'

// The page-admin sidebar console (ADR-153 — layer 3, the *light* per-page layer).
// Home lists the categories that apply for THIS viewer; tap one to drill in. The
// console holds **page-globals** only — this page's Basics settings + its QR code —
// and otherwise **links back to the full-page suite** (its top-bar tabs) for the heavy
// management. So the sidebar *tunes the page*; the suite *manages the domain*. Tiers
// filter automatically because the links come from the role-gated catalog
// (`visibleLinks`) — a janitor sees every suite, a host only what they steward.

type Item =
  | { kind: 'link'; label: string; sub?: string; href: string; Icon: LucideIcon }
  | { kind: 'soon'; label: string; sub?: string; Icon: LucideIcon }

type Category = {
  key: string
  label: string
  Icon: LucideIcon
  summary?: string
  module?: ReactNode
  /** The full-page suite this category opens into (its first catalog link). */
  suiteHref?: string
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
  if (/^\/admin\/(engagement|intel|outcomes|insights|segments|expansion)/.test(href)) return 'insights'
  if (/^\/admin\/(circles|channels|events|hubs|nexuses)/.test(href)) return 'spaces'
  if (href === '/pages') return 'layout'
  return 'platform' // /admin overview, vera, help-gaps, ai, demo
}

export function AdminConsole({
  role,
  webRole = 'none',
  staffRole,
  onNavigate,
}: {
  role: CommunityRole | null
  /** STAFF axis (web_role, ADR-208) — independent of the community ladder. */
  webRole?: WebRole
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

  // "Janitor" affordances ride the STAFF axis now (web_role, ADR-208), not the
  // community ladder; team_members staff still surface the Pages link too.
  const isJanitor = isStaff(webRole) || staffRole != null

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
  for (const l of visibleLinks(role ?? 'member', webRole, staffRole)) {
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

  // Page-globals (ADR-153 layer 3) — the ONLY in-context modules the sidebar keeps:
  // the page's own QR code under Reach (Basics is the entity settings module, below).
  // Heavy management suites are NOT rendered here; a category instead links back to its
  // full-page suite (its top-bar tabs) for that work — the sidebar tunes the page.
  const PAGE_GLOBALS: Record<string, { module: ReactNode; summary: string }> = {
    reach: { module: <QrGeneratorModule />, summary: 'This page’s QR code' },
  }

  const categories: Category[] = CATEGORIES.map((c) => {
    const raw = itemsBySlot.get(c.key) ?? []
    const items = c.key === 'layout' ? [...layoutExtra, ...raw] : raw
    const pageGlobal = PAGE_GLOBALS[c.key]
    const mod = c.key === 'basics' ? settingsModule ?? undefined : pageGlobal?.module
    // The parent suite this category opens into — its first catalog link is the suite's
    // entry tab; landing there reveals the suite's full top-bar sub-nav (parent + tabs).
    const suiteHref = raw.find((it): it is Extract<Item, { kind: 'link' }> => it.kind === 'link')?.href
    const summary =
      c.key === 'basics' && mod
        ? 'Name, details, status'
        : pageGlobal && mod
          ? pageGlobal.summary
          : items.length
            ? `${items.length} ${items.length === 1 ? 'setting' : 'settings'}`
            : undefined
    return { ...c, items, module: mod, suiteHref, summary }
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
            {active.suiteHref ? (
              <Link
                href={active.suiteHref}
                onClick={onNavigate}
                className="group flex items-center gap-1.5 text-sm font-bold text-text transition-colors hover:text-primary-strong"
                title={`Open the ${active.label} suite`}
              >
                <active.Icon className="h-4 w-4 text-primary-strong" />
                {active.label}
                <ArrowUpRight className="h-3.5 w-3.5 text-subtle transition-colors group-hover:text-primary-strong" />
              </Link>
            ) : (
              <span className="flex items-center gap-1.5 text-sm font-bold text-text">
                <active.Icon className="h-4 w-4 text-primary-strong" />
                {active.label}
              </span>
            )}
          </div>
          <div className="space-y-2 p-1.5">
            {active.module && <div className="px-1 py-1">{active.module}</div>}
            {active.suiteHref && (
              <p className="px-2.5 pt-0.5 text-2xs text-subtle">
                Manage in the full <span className="font-medium text-muted">{active.label}</span> suite. These open its tabs:
              </p>
            )}
            {active.items.map(renderItem)}
          </div>
        </>
      ) : null}
    </div>
  )
}
