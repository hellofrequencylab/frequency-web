'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Eye, Check, X, ChevronDown } from 'lucide-react'
import {
  type CommunityRole,
  ROLE_LABEL,
  roleBadgeStyle,
} from '@/lib/community-roles'
import { ROLE_HIERARCHY, atLeastRole, roleRank } from '@/lib/core/roles'
import { setViewAsRole } from '@/app/(main)/view-as-actions'

// "View as a role under you" control — for every steward HOST and above. It lives at
// the TOP of the left profile dock's slide-up menu; picking a role below your own
// downgrades the whole app (nav, capabilities, server enforcement) to preview what
// that role sees, and "Exit" restores your own view. The list only shows roles at or
// below your own — view-as is downgrade-only and can never escalate.
//
// The dock panel clips its children (`overflow-hidden`, for the rise/collapse
// animation), so the role list is rendered through a portal and pinned above
// the trigger with fixed positioning — it can't be clipped by the panel and
// always opens upward into clear space.
export function ViewAsControl({
  realRole,
  currentRole,
  asVisitor = false,
}: {
  realRole: CommunityRole
  currentRole: CommunityRole
  /** True when previewing the logged-out visitor experience. */
  asVisitor?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; bottom: number; width: number } | null>(null)
  const [isPending, startTransition] = useTransition()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Position the portal menu just above the trigger; keep it there on resize.
  function place() {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setAnchor({ left: r.left, bottom: window.innerHeight - r.top + 6, width: r.width })
  }

  useEffect(() => {
    if (!open) return
    place()
    function onOutside(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place)
    }
  }, [open])

  if (!atLeastRole(realRole, 'host')) return null

  const impersonating = asVisitor || currentRole !== realRole

  function choose(role: CommunityRole | 'visitor') {
    setOpen(false)
    startTransition(async () => {
      // Selecting your own real role clears the override.
      await setViewAsRole(role === realRole ? null : role)
      // Full reload so the new role's content visibility is reflected everywhere
      // (nav, capabilities, page content) — not just a soft re-render.
      window.location.reload()
    })
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
          impersonating
            ? 'bg-signal-bg text-signal-strong'
            : 'text-text hover:bg-surface-elevated'
        }`}
      >
        <Eye className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate">
          {impersonating ? `Viewing as ${asVisitor ? 'Visitor' : ROLE_LABEL[currentRole]}` : 'View as role'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && anchor && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: 'fixed',
            left: anchor.left,
            bottom: anchor.bottom,
            width: Math.max(anchor.width, 208),
          }}
          className="z-[60] rounded-xl border border-border bg-surface-elevated shadow-xl shadow-black/10 py-1"
        >
          <p className="px-3 py-1.5 text-3xs font-semibold uppercase tracking-wider text-subtle">
            View the app as
          </p>
          {ROLE_HIERARCHY.filter((r) => roleRank(r) <= roleRank(realRole)).map((r) => {
            const active = !asVisitor && r === currentRole
            const isSelf = r === realRole
            return (
              <button
                key={r}
                role="menuitem"
                onClick={() => choose(r)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface transition-colors"
              >
                <span className="rank-badge text-3xs leading-tight" style={roleBadgeStyle(r)}>
                  {ROLE_LABEL[r]}
                </span>
                {isSelf && <span className="text-xs text-subtle">(you)</span>}
                {active && <Check className="w-3.5 h-3.5 ml-auto text-primary-strong" />}
              </button>
            )
          })}
          {/* Visitor — the logged-out preview (below member). */}
          <button
            role="menuitem"
            onClick={() => choose('visitor')}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface transition-colors"
          >
            <span className="rounded-full bg-surface px-2 py-0.5 text-3xs font-semibold leading-tight text-muted">
              Visitor
            </span>
            <span className="text-xs text-subtle">logged out</span>
            {asVisitor && <Check className="w-3.5 h-3.5 ml-auto text-primary-strong" />}
          </button>

          {impersonating && (
            <div className="border-t border-border mt-1 pt-1">
              <button
                role="menuitem"
                onClick={() => choose(realRole)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-signal-strong hover:bg-surface transition-colors"
              >
                <X className="w-4 h-4" />
                Exit view-as (back to {ROLE_LABEL[realRole]})
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
