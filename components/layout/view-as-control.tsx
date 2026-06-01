'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Check, X, ChevronDown } from 'lucide-react'
import {
  type CommunityRole,
  ROLE_LABEL,
  roleBadgeStyle,
} from '@/lib/community-roles'
import { ROLE_HIERARCHY } from '@/lib/core/roles'
import { setViewAsRole } from '@/app/(main)/view-as-actions'

// Janitor-only "view as any role" control. Lives under the sidebar profile box;
// the menu opens upward. Picking a role downgrades the whole app (nav,
// capabilities, server enforcement) to preview that role; "Exit" restores the
// janitor's own view. Rendered only when the REAL role is janitor.
export function ViewAsControl({
  realRole,
  currentRole,
}: {
  realRole: CommunityRole
  currentRole: CommunityRole
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  if (realRole !== 'janitor') return null

  const impersonating = currentRole !== realRole

  function choose(role: CommunityRole) {
    setOpen(false)
    startTransition(async () => {
      // Selecting your own real role clears the override.
      await setViewAsRole(role === realRole ? null : role)
      router.refresh()
    })
  }

  return (
    <div ref={ref} className="relative px-2 pb-2">
      <button
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
          {impersonating ? `Viewing as ${ROLE_LABEL[currentRole]}` : 'View as role'}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-2 right-2 mb-1 rounded-xl border border-border bg-surface-elevated shadow-xl shadow-black/10 py-1 z-50"
        >
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-subtle">
            View the app as
          </p>
          {ROLE_HIERARCHY.map((r) => {
            const active = r === currentRole
            const isSelf = r === realRole
            return (
              <button
                key={r}
                role="menuitem"
                onClick={() => choose(r)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text hover:bg-surface transition-colors"
              >
                <span className="rank-badge text-[10px] leading-tight" style={roleBadgeStyle(r)}>
                  {ROLE_LABEL[r]}
                </span>
                {isSelf && <span className="text-xs text-subtle">(you)</span>}
                {active && <Check className="w-3.5 h-3.5 ml-auto text-primary-strong" />}
              </button>
            )
          })}
          {impersonating && (
            <div className="border-t border-border mt-1 pt-1">
              <button
                role="menuitem"
                onClick={() => choose(realRole)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium text-signal-strong hover:bg-surface transition-colors"
              >
                <X className="w-4 h-4" />
                Exit view-as (back to Janitor)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
