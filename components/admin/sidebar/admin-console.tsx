'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Pencil,
  LayoutTemplate,
  Palette,
  Megaphone,
  SlidersHorizontal,
  LayoutDashboard,
  FileText,
  Users,
  Lock,
  ChevronRight,
  ChevronLeft,
  Search,
} from 'lucide-react'
import { meetsAccess } from '@/lib/nav-areas'
import type { CommunityRole } from '@/lib/community-roles'
import type { StaffRole } from '@/lib/staff'
import { CircleSettingsModule } from '@/components/admin/modules/circle-settings-module'
import { HubSettingsModule } from '@/components/admin/modules/hub-settings-module'
import { NexusSettingsModule } from '@/components/admin/modules/nexus-settings-module'
import { EventSettingsModule } from '@/components/admin/modules/event-settings-module'

// The page-admin sidebar console (ADR-137 drill-down · ADR-138 the "manage" surface).
// Home lists the spine categories that apply to this page; tap one to drill into its
// settings; search jumps straight to any item. Replaces the dock's old flat list —
// same content, organized by the 9-category spine, so it scales as modules land.
//
// Today the categories are assembled here (the registry's modules aren't yet
// server-composed with their own Components); as the @admin slot lands this becomes
// `modulesForSurface(scope, caps, 'sidebar')` grouped by slot.

type Item =
  | { kind: 'link'; label: string; sub?: string; href: string; Icon: typeof Pencil }
  | { kind: 'soon'; label: string; sub?: string; Icon: typeof Pencil }

type Category = {
  key: string
  label: string
  Icon: typeof Pencil
  summary?: string
  module?: ReactNode
  items: Item[]
}

// The "Edit info" deep-link for routes that don't yet have an in-place module.
function sectionEdit(pathname: string): { label: string; href: string } | null {
  if (pathname.startsWith('/channels')) return { label: 'Channels', href: '/admin/channels' }
  if (pathname.startsWith('/people')) return { label: 'Members', href: '/admin/members' }
  if (/^\/(crew|practices|journeys|programs|library)/.test(pathname)) return { label: 'Gamification', href: '/admin/gamification' }
  return null
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

  const isStaff = staffRole != null
  const isJanitor = meetsAccess('janitor', role) || isStaff

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
  const edit = sectionEdit(pathname)

  const categories: Category[] = [
    {
      key: 'basics',
      label: 'Basics',
      Icon: SlidersHorizontal,
      summary: settingsModule ? 'Name, details, status' : edit?.label,
      module: settingsModule ?? undefined,
      items: settingsModule || !edit ? [] : [{ kind: 'link' as const, label: 'Edit info', sub: edit.label, href: edit.href, Icon: Pencil }],
    },
    {
      key: 'layout',
      label: 'Layout',
      Icon: LayoutTemplate,
      summary: 'Page modules & styles',
      items: [
        { kind: 'soon' as const, label: 'Layout template', sub: 'Soon', Icon: LayoutTemplate },
        { kind: 'soon' as const, label: 'Basic styles', sub: 'Soon', Icon: Palette },
        ...(isJanitor ? [{ kind: 'link' as const, label: 'Pages & content', href: '/pages', Icon: FileText }] : []),
      ],
    },
    {
      key: 'comms',
      label: 'Comms',
      Icon: Megaphone,
      summary: 'Broadcast to your people',
      items: [{ kind: 'link' as const, label: 'Group dispatch', sub: 'Broadcast', href: '/admin/dispatches', Icon: Megaphone }],
    },
    ...(isJanitor
      ? [
          {
            key: 'people',
            label: 'People',
            Icon: Users,
            summary: 'Members & roles',
            items: [
              { kind: 'link' as const, label: 'Members', href: '/admin/members', Icon: Users },
              { kind: 'link' as const, label: 'Roles & access', href: '/admin/roles', Icon: Lock },
            ],
          },
        ]
      : []),
    {
      key: 'platform',
      label: 'Platform',
      Icon: LayoutDashboard,
      summary: 'Full admin',
      items: [{ kind: 'link' as const, label: 'Admin home', href: '/admin', Icon: LayoutDashboard }],
    },
  ].filter((c) => c.module || c.items.length > 0)

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
          <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">Soon</span>
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
        {it.sub && <span className="truncate text-[11px] text-subtle">{it.sub}</span>}
      </Link>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {view === 'home' ? (
        <>
          {/* Search */}
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
                  {c.summary && <span className="flex-1 truncate text-right text-[11px] text-subtle">{c.summary}</span>}
                  <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
                </button>
              ))}
            </div>
          )}
        </>
      ) : active ? (
        <>
          {/* Category screen header */}
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
