'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Shield, X, GripVertical, Pencil, LayoutTemplate, Palette, Megaphone, SlidersHorizontal,
  LayoutDashboard, FileText, Users, Lock,
} from 'lucide-react'
import { meetsAccess } from '@/lib/nav-areas'
import type { CommunityRole } from '@/lib/community-roles'
import type { StaffRole } from '@/lib/staff'

// The page admin dock (CAPABILITIES-AND-MOBILE.md — inline admin made into a dock).
// An always-available, OPAQUE tab pinned to a screen edge for operators. Tap → a
// panel of admin actions FOR THE CURRENT PAGE (edit info, layout template, basic
// styles, settings, group dispatch, + any admin surface). The panel has a pull-tab
// (grip) to reposition the dock; the position persists across the whole site
// (localStorage). Phase 1: gating + position + the actions wired to the existing
// editors. Layout-template / basic-styles in-place editing is Phase 2 (shown here
// as "Soon"). Mobile + desktop.

type DockPos = { side: 'left' | 'right'; top: number }
const DEFAULT_POS: DockPos = { side: 'right', top: 50 }

type Action =
  | { kind: 'link'; label: string; sub?: string; href: string; Icon: typeof Pencil }
  | { kind: 'soon'; label: string; sub?: string; Icon: typeof Pencil }

// The "Manage this section" deep-link for the current route → its admin editor.
function sectionEdit(pathname: string): { label: string; href: string } | null {
  if (pathname.startsWith('/circles')) return { label: 'Circles', href: '/admin/circles' }
  if (pathname.startsWith('/channels')) return { label: 'Channels', href: '/admin/channels' }
  if (pathname.startsWith('/events')) return { label: 'Events', href: '/admin/events' }
  if (pathname.startsWith('/people')) return { label: 'Members', href: '/admin/members' }
  if (/^\/(crew|practices|journeys|programs|library)/.test(pathname)) return { label: 'Gamification', href: '/admin/gamification' }
  return null
}

export function PageAdminDock({ role, staffRole }: { role: CommunityRole | null; staffRole: StaffRole | null }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<DockPos>(DEFAULT_POS)

  // Hydrate the saved position after mount (client-only pref; no SSR mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem('freq-admin-dock')
      if (raw) {
        const p = JSON.parse(raw) as DockPos
        if ((p.side === 'left' || p.side === 'right') && typeof p.top === 'number') {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setPos({ side: p.side, top: Math.min(90, Math.max(10, p.top)) })
        }
      }
    } catch {
      /* ignore bad saved value */
    }
  }, [])

  // Close the panel on route change (derived-state pattern).
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  const isStaff = staffRole != null
  const can = (min: CommunityRole) => meetsAccess(min, role) || isStaff
  const isJanitor = meetsAccess('janitor', role)

  // Operators only — a member never sees the dock at all.
  if (!can('host')) return null

  const edit = sectionEdit(pathname)
  const actions: Action[] = [
    ...(edit ? [{ kind: 'link' as const, label: 'Edit info', sub: edit.label, href: edit.href, Icon: Pencil }] : []),
    { kind: 'soon', label: 'Layout template', sub: 'Soon', Icon: LayoutTemplate },
    { kind: 'soon', label: 'Basic styles', sub: 'Soon', Icon: Palette },
    { kind: 'link', label: 'Group dispatch', sub: 'Broadcast to your people', href: '/admin/dispatches', Icon: Megaphone },
    { kind: 'link', label: 'Settings', sub: 'Admin overview', href: '/admin', Icon: SlidersHorizontal },
    ...(isJanitor
      ? [
          { kind: 'link' as const, label: 'Members', href: '/admin/members', Icon: Users },
          { kind: 'link' as const, label: 'Pages & content', href: '/pages', Icon: FileText },
          { kind: 'link' as const, label: 'Roles & access', href: '/admin/roles', Icon: Lock },
        ]
      : []),
    { kind: 'link', label: 'Admin home', href: '/admin', Icon: LayoutDashboard },
  ]

  // Drag the pull-tab → reposition the dock (vertical + snap to nearest edge).
  function startDrag(e: React.PointerEvent) {
    e.preventDefault()
    const move = (ev: PointerEvent) => {
      setPos({
        side: ev.clientX < window.innerWidth / 2 ? 'left' : 'right',
        top: Math.min(90, Math.max(10, (ev.clientY / window.innerHeight) * 100)),
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setPos((p) => {
        try { localStorage.setItem('freq-admin-dock', JSON.stringify(p)) } catch { /* ignore */ }
        return p
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onRight = pos.side === 'right'

  return (
    <>
      {/* Closed tab — opaque, always available. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Page admin"
          style={{ top: `${pos.top}%`, [pos.side]: 0 }}
          className={`fixed z-40 flex -translate-y-1/2 items-center justify-center bg-primary px-2 py-3 text-on-primary shadow-lg transition-colors hover:bg-primary-hover ${
            onRight ? 'rounded-l-xl' : 'rounded-r-xl'
          }`}
        >
          <Shield className="h-4 w-4" />
        </button>
      )}

      {/* Open panel — anchored to the dock's edge + vertical position. */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-label="Page admin"
            style={{ top: `${pos.top}%`, [pos.side]: 0 }}
            className={`fixed z-50 flex max-h-[80vh] w-60 max-w-[85vw] -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl ${
              onRight ? 'rounded-r-none border-r-0' : 'rounded-l-none border-l-0'
            }`}
          >
            {/* Header — grip (drag to move) · title · close. */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-elevated/50 px-2 py-2">
              <button
                type="button"
                onPointerDown={startDrag}
                aria-label="Drag to reposition"
                title="Drag to move"
                className="cursor-grab touch-none rounded-md p-1 text-subtle hover:bg-surface-elevated hover:text-text active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <span className="flex flex-1 items-center gap-1.5 text-sm font-bold text-text">
                <Shield className="h-4 w-4 text-primary-strong" />
                Page admin
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-subtle hover:bg-surface-elevated hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Actions */}
            <div className="flex-1 overflow-y-auto p-1.5">
              {actions.map((a) =>
                a.kind === 'soon' ? (
                  <div
                    key={a.label}
                    aria-disabled
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-subtle opacity-60"
                  >
                    <a.Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{a.label}</span>
                    <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">Soon</span>
                  </div>
                ) : (
                  <Link
                    key={a.label}
                    href={a.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
                  >
                    <a.Icon className="h-4 w-4 shrink-0 text-muted" />
                    <span className="flex-1 truncate">{a.label}</span>
                    {a.sub && <span className="truncate text-[11px] text-subtle">{a.sub}</span>}
                  </Link>
                ),
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
