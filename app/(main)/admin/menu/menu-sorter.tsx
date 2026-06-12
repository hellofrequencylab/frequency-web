'use client'

import { useRef, useState, useTransition } from 'react'
import { Eye, EyeOff, GripVertical, RotateCcw } from 'lucide-react'
import { NAV_AREAS } from '@/lib/nav-areas'
import { setMenuOrder, setMenuVisibility, resetMenuConfig } from './actions'

// The GLOBAL menu editor — drag to reorder the ONE shared rail and toggle each item
// shown/hidden for EVERYONE. Native HTML5 drag (no dnd library), copying the
// SectionSorter pattern in components/admin/admin-page-dock.tsx. The page already
// rendered the saved order server-side; this hydrates from the same `initialOrder`.
//
// Items stay grouped under their section header so the operator sees the rail's
// shape, but a drag can move an item ANYWHERE in the order (one global sequence) —
// the section labels are just signposts derived from each item's `section`.

const AREA_BY_KEY = new Map(NAV_AREAS.map((a) => [a.key, a]))

export function MenuSorter({
  initialOrder,
  initialHidden,
}: {
  /** Operator order, area_key[] — already applied server-side. */
  initialOrder: string[]
  /** Globally hidden area keys. */
  initialHidden: string[]
}) {
  const [order, setOrder] = useState<string[]>(initialOrder)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initialHidden))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const dragKey = useRef<string | null>(null)

  function labelOf(key: string) {
    return AREA_BY_KEY.get(key)?.label ?? key
  }
  function sectionOf(key: string) {
    return AREA_BY_KEY.get(key)?.section ?? null
  }

  function saveOrder(next: string[]) {
    setError(null)
    startTransition(async () => {
      try {
        await setMenuOrder(next)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the order.')
      }
    })
  }

  function moveOver(overKey: string) {
    const from = dragKey.current
    if (!from || from === overKey) return
    setOrder((cur) => {
      const next = cur.filter((k) => k !== from)
      next.splice(next.indexOf(overKey), 0, from)
      return next
    })
  }

  function toggleHidden(key: string) {
    const nextHidden = !hidden.has(key)
    setHidden((cur) => {
      const next = new Set(cur)
      if (nextHidden) next.add(key)
      else next.delete(key)
      return next
    })
    setError(null)
    startTransition(async () => {
      try {
        await setMenuVisibility(key, nextHidden)
      } catch (e) {
        // Roll back on failure.
        setHidden((cur) => {
          const next = new Set(cur)
          if (nextHidden) next.delete(key)
          else next.add(key)
          return next
        })
        setError(e instanceof Error ? e.message : 'Could not save visibility.')
      }
    })
  }

  function reset() {
    const codeOrder = NAV_AREAS.map((a) => a.key)
    setOrder(codeOrder)
    setHidden(new Set())
    setError(null)
    startTransition(async () => {
      try {
        await resetMenuConfig()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reset.')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Drag to reorder the rail; hide an item to remove it for everyone. Changes
          save instantly and apply on each member’s next page load.
        </p>
        <span className="shrink-0 text-xs text-subtle" aria-live="polite">
          {isPending ? 'Saving…' : 'Drag to reorder'}
        </span>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <ul className="mt-4 space-y-1">
        {order.map((key, i) => {
          const isHidden = hidden.has(key)
          const section = sectionOf(key)
          const prevSection = i > 0 ? sectionOf(order[i - 1]) : null
          // A signpost header when the section changes from the previous item.
          const showHeader = section !== prevSection
          return (
            <li key={key}>
              {showHeader && section && (
                <p className="px-1 pb-1 pt-3 text-3xs font-semibold uppercase tracking-wider text-subtle first:pt-0">
                  {section}
                </p>
              )}
              <div
                draggable
                onDragStart={(e) => {
                  dragKey.current = key
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  moveOver(key)
                }}
                onDragEnd={() => {
                  dragKey.current = null
                  saveOrder(order)
                }}
                className={`flex cursor-grab items-center gap-2 rounded-xl border border-border bg-canvas/40 px-2.5 py-2 text-sm font-medium active:cursor-grabbing ${
                  isHidden ? 'text-subtle' : 'text-text'
                }`}
              >
                <GripVertical className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <span className={`min-w-0 flex-1 truncate ${isHidden ? 'line-through' : ''}`}>
                  {labelOf(key)}
                </span>
                {isHidden && (
                  <span className="shrink-0 rounded-full bg-surface-elevated px-1.5 py-0.5 text-3xs font-semibold text-muted">
                    Hidden
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => toggleHidden(key)}
                  aria-pressed={!isHidden}
                  aria-label={isHidden ? `Show ${labelOf(key)}` : `Hide ${labelOf(key)}`}
                  title={isHidden ? 'Show for everyone' : 'Hide for everyone'}
                  className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-text"
                >
                  {isHidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={reset}
        className="mt-3 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Reset to default order and visibility
      </button>
    </div>
  )
}
