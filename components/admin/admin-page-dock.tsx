'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronUp, GripVertical, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { visibleLinks } from '@/app/(main)/admin/sections'
import { DASH_SECTIONS, sanitizeDashOrder, type DashSectionId } from '@/app/(main)/admin/dash-sections'
import { setAdminDashOrder } from '@/app/(main)/admin/dash-order-actions'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'

// The PAGE-ADMIN dock — the BOTTOM-RIGHT corner tab, the profile card's mirror (the
// admin layout mounts both fixed, in canvas-skinned wrappers: no solid panel). The
// tab slides up to reveal this page's admin: quick settings links, and on the Home
// dashboard the SORT functions — a drag-and-drop card editor that reorders the
// dashboard sections (persisted per browser via a cookie, applied during server
// render so the page never reflows).

const SETTINGS_HREFS = ['/admin/roles', '/admin/ai', '/admin/audit'] as const

export function AdminPageDock({
  role,
  webRole = 'none',
  staffRole = null,
  initialOrder,
}: {
  role: CommunityRole
  webRole?: WebRole
  staffRole?: StaffRole | null
  /** Cookie-resolved section order, server-passed so the editor opens in sync. */
  initialOrder: DashSectionId[]
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const links = visibleLinks(role, webRole, staffRole)
  const settingLinks = SETTINGS_HREFS.map((href) => links.find((l) => l.href === href)).filter(
    (l): l is NonNullable<typeof l> => !!l,
  )

  return (
    <div>
      {/* The panel — revealed above the tab's pinned bottom edge. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-1 pt-2">
            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Page settings
            </p>
            <div className="space-y-0.5">
              {settingLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
                >
                  <l.Icon className="h-4 w-4 shrink-0 text-muted" />
                  {l.label}
                </Link>
              ))}
            </div>

            {pathname === '/admin' && <SectionSorter initialOrder={initialOrder} />}
          </div>
        </div>
      </div>

      {/* The tab. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-3 text-left transition-colors hover:bg-surface-elevated"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-muted">
          <SlidersHorizontal className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight text-text">Page admin</span>
          <span className="mt-0.5 block text-xs text-subtle">Settings &amp; sort</span>
        </span>
        <ChevronUp
          className={`h-4 w-4 shrink-0 text-subtle transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
    </div>
  )
}

// ── Sort functions — the drag-and-drop card editor for the Home sections. ──────
// Drag a card to reorder; the order saves on drop and the dashboard re-renders in
// the new order. Reset restores the default.

function SectionSorter({ initialOrder }: { initialOrder: DashSectionId[] }) {
  const [order, setOrder] = useState<DashSectionId[]>(() => sanitizeDashOrder(initialOrder))
  const [isPending, startTransition] = useTransition()
  const dragId = useRef<DashSectionId | null>(null)
  const labelOf = (id: DashSectionId) => DASH_SECTIONS.find((s) => s.id === id)?.label ?? id

  function save(next: DashSectionId[]) {
    startTransition(() => setAdminDashOrder(next))
  }

  function moveOver(overId: DashSectionId) {
    const from = dragId.current
    if (!from || from === overId) return
    setOrder((cur) => {
      const next = cur.filter((id) => id !== from)
      next.splice(next.indexOf(overId), 0, from)
      return next
    })
  }

  return (
    <div className="mt-3 border-t border-border/60 px-0 pt-2.5">
      <div className="flex items-baseline justify-between px-2 pb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Sort sections</p>
        <span className="text-xs text-subtle">{isPending ? 'Saving…' : 'Drag to reorder'}</span>
      </div>
      <ul className="space-y-1">
        {order.map((id) => (
          <li
            key={id}
            draggable
            onDragStart={(e) => {
              dragId.current = id
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              e.preventDefault()
              moveOver(id)
            }}
            onDragEnd={() => {
              dragId.current = null
              save(order)
            }}
            className="flex cursor-grab items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-2 text-sm font-medium text-text active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
            {labelOf(id)}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          const next = sanitizeDashOrder(null)
          setOrder(next)
          save(next)
        }}
        className="mt-1.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Reset to default order
      </button>
    </div>
  )
}
