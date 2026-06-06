'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Shield, X, PanelRight, Columns2 } from 'lucide-react'
import { meetsAccess } from '@/lib/nav-areas'
import type { CommunityRole } from '@/lib/community-roles'
import type { StaffRole } from '@/lib/staff'
import { AdminConsole } from '@/components/admin/sidebar/admin-console'

// The page admin dock (CAPABILITIES-AND-MOBILE.md — inline admin as a side panel).
// Operators get per-page admin actions (edit info, layout template, basic styles,
// settings, group dispatch, + admin surfaces).
//   • Desktop: a LIGHT, unobtrusive vertical tab on the right edge. Opening slides a
//     panel in; two modes (a setting): PUSH (content shifts over, whole page stays
//     visible) or OVERLAY (panel floats over). Width is drag-adjustable. Both persist.
//   • Mobile: no edge tab — the panel is opened from the header admin button and
//     shows as an overlay sheet.
// State (open/mode/width) is owned by the shell so PUSH can pad the content.

export type AdminDockMode = 'overlay' | 'push'

export function PageAdminDock({
  role,
  staffRole,
  open,
  onOpenChange,
  mode,
  onModeChange,
  width,
  onWidthChange,
}: {
  role: CommunityRole | null
  staffRole: StaffRole | null
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: AdminDockMode
  onModeChange: (m: AdminDockMode) => void
  width: number
  onWidthChange: (w: number) => void
}) {
  const pathname = usePathname()

  // Close on route change (derived-state pattern).
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (open) onOpenChange(false)
  }

  const isStaff = staffRole != null
  const can = (min: CommunityRole) => meetsAccess(min, role) || isStaff
  if (!can('host')) return null // operators only

  // Drag the left edge to resize (desktop). Width persists via onWidthChange.
  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    const move = (ev: PointerEvent) => {
      onWidthChange(Math.min(560, Math.max(260, window.innerWidth - ev.clientX)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <>
      {/* Closed tab — desktop only, LIGHT & unobtrusive. (Mobile opens from the header.) */}
      {!open && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label="Page admin"
          className="fixed right-0 top-1/2 z-30 hidden h-[40vh] w-7 -translate-y-1/2 flex-col items-center justify-center gap-2 rounded-l-2xl border border-r-0 border-border/50 bg-surface/40 text-muted opacity-60 backdrop-blur-sm transition-opacity hover:opacity-100 md:flex"
        >
          <Shield className="h-4 w-4" />
          <span className="text-[10px] font-semibold uppercase tracking-wider [writing-mode:vertical-rl]">Admin</span>
        </button>
      )}

      {open && (
        <>
          {/* Backdrop — dim on mobile; on desktop only in overlay mode (push leaves
              the page interactive). Click closes. */}
          <div
            onClick={() => onOpenChange(false)}
            aria-hidden
            className={`fixed inset-0 z-30 bg-black/30 md:bg-transparent ${mode === 'push' ? 'md:hidden' : ''}`}
          />

          {/* Panel — right side. Width via a CSS var so mobile can override to a sheet. */}
          <aside
            role="dialog"
            aria-label="Page admin"
            style={{ ['--admin-w' as string]: `${width}px` }}
            className="fixed right-0 top-14 z-40 flex w-[88vw] max-w-[92vw] flex-col border-l border-border bg-surface shadow-xl md:w-[var(--admin-w)] max-md:bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0"
          >
            {/* Resize handle — desktop only. */}
            <div
              onPointerDown={startResize}
              className="absolute inset-y-0 left-0 hidden w-1.5 cursor-col-resize bg-transparent hover:bg-primary-bg md:block"
              aria-hidden
            />

            {/* Header */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-elevated/50 px-3 py-2.5">
              <Shield className="h-4 w-4 shrink-0 text-primary-strong" />
              <span className="flex-1 text-sm font-bold text-text">Page admin</span>

              {/* Mode toggle — desktop only (push vs overlay). */}
              <div className="hidden items-center rounded-lg bg-surface p-0.5 ring-1 ring-border md:flex">
                <button
                  type="button"
                  onClick={() => onModeChange('push')}
                  aria-pressed={mode === 'push'}
                  title="Push the page over"
                  className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors ${mode === 'push' ? 'bg-primary-bg text-primary-strong' : 'text-subtle hover:text-text'}`}
                >
                  <Columns2 className="h-3.5 w-3.5" />Push
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange('overlay')}
                  aria-pressed={mode === 'overlay'}
                  title="Float over the page"
                  className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors ${mode === 'overlay' ? 'bg-primary-bg text-primary-strong' : 'text-subtle hover:text-text'}`}
                >
                  <PanelRight className="h-3.5 w-3.5" />Over
                </button>
              </div>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="shrink-0 rounded-md p-1 text-subtle hover:bg-surface-elevated hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drill-down console (ADR-137 spine · ADR-138 the "manage" surface). */}
            <AdminConsole role={role} staffRole={staffRole} onNavigate={() => onOpenChange(false)} />
          </aside>
        </>
      )}
    </>
  )
}
