'use client'

import { useCallback, useEffect, useMemo, useRef, type DragEvent, type KeyboardEvent } from 'react'
import type { DropTarget } from '@/lib/calendar/planner/drop'
import type { StageTarget } from '@/lib/calendar/planner/stage-drop'

/** Anywhere a hand can let go: a day or a time on a grid, or a stage column on the Kanban. */
type AnyTarget = DropTarget | StageTarget

// THE HANDS OF A DRAG. One hook for every view: which thing is in hand, which target is lit, and the
// drop. A browser hides a drag's payload until the drop, so the thing in hand is kept in a ref, and the
// lit target is marked on the element itself (`data-drop`) so a drag over a Month never re-renders the
// nine blocks under it. What a drop MEANS is not decided here: the host hands `onDrop` the source and
// the target and lib/calendar/planner/drop.ts answers. Off (`enabled` false) means nothing is
// draggable and no target accepts, which is how a person who can only read the calendar is kept from
// moving it.

/** The thing in hand: a date, a to-do or a Plan card, and how far down it the pointer holds it. */
export interface DragSource {
  kind: 'item' | 'todo' | 'plan'
  id: string
  /** Pixels from the top of the dragged element to the pointer, so a card's TOP is what snaps. */
  grabPx: number
}

export interface SuiteDnd {
  enabled: boolean
  /** Spread onto the element a person picks up. */
  /** `grid` is true on the time grid, where Shift with Up and Down moves by 15 minutes. */
  dragProps: (kind: DragSource['kind'], id: string, grid?: boolean) => Record<string, unknown>
  /** Spread onto an element that accepts a drop. `resolve` says where the drop landed, or null to refuse. */
  targetProps: (
    resolve: (e: DragEvent<HTMLElement>, src: DragSource) => AnyTarget | null,
    onHover?: (target: AnyTarget | null, src?: DragSource) => void,
  ) => Record<string, unknown>
}

const LIT = 'data-drop'
const ROOT_FLAG = 'data-dragging'

export function useSuiteDnd(
  enabled: boolean,
  onDrop: (src: DragSource, target: AnyTarget) => void,
  /** Where Shift with an arrow would move the focused thing, or null for any other key. */
  keyTarget?: (kind: DragSource['kind'], id: string, e: KeyboardEvent<HTMLElement>, grid: boolean) => AnyTarget | null,
): SuiteDnd {
  const source = useRef<DragSource | null>(null)
  const lit = useRef<HTMLElement | null>(null)
  const root = useRef<HTMLElement | null>(null)
  const handler = useRef(onDrop)
  const keys = useRef(keyTarget)
  useEffect(() => {
    handler.current = onDrop
    keys.current = keyTarget
  })

  const unlight = useCallback(() => {
    lit.current?.removeAttribute(LIT)
    lit.current = null
  }, [])
  const finish = useCallback(() => {
    source.current = null
    unlight()
    root.current?.removeAttribute(ROOT_FLAG)
    root.current = null
  }, [unlight])
  useEffect(() => finish, [finish])

  return useMemo<SuiteDnd>(
    () => ({
      enabled,
      dragProps: (kind, id, grid = false) =>
        enabled
          ? {
              draggable: true,
              onDragStart: (e: DragEvent<HTMLElement>) => {
                const rect = e.currentTarget.getBoundingClientRect()
                source.current = { kind, id, grabPx: Math.max(0, e.clientY - rect.top) }
                root.current = e.currentTarget.closest<HTMLElement>('.cal-suite')
                e.dataTransfer.effectAllowed = 'move'
                // Some text, because a drag with an empty payload is cancelled on the spot in Firefox.
                try {
                  e.dataTransfer.setData('text/plain', id)
                } catch {
                  // A browser that will not take the payload still drags: the source is in the ref.
                }
                const flagged = root.current
                // After the browser has taken the drag image: styling the page mid-start can cancel the drag.
                setTimeout(() => {
                  if (source.current && flagged) flagged.setAttribute(ROOT_FLAG, kind)
                }, 0)
              },
              onDragEnd: finish,
              onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
                const target = keys.current?.(kind, id, e, grid) ?? null
                if (!target) return
                // A move is this thing's: the calendar must not also page on the same arrow.
                e.preventDefault()
                e.stopPropagation()
                handler.current({ kind, id, grabPx: 0 }, target)
              },
            }
          : {},
      targetProps: (resolve, onHover) =>
        enabled
          ? {
              onDragOver: (e: DragEvent<HTMLElement>) => {
                const src = source.current
                if (!src) return
                const target = resolve(e, src)
                if (!target) return
                // Without this the browser never fires a drop on the element at all.
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (lit.current !== e.currentTarget) {
                  unlight()
                  lit.current = e.currentTarget
                  e.currentTarget.setAttribute(LIT, '')
                }
                onHover?.(target, src)
              },
              onDragLeave: (e: DragEvent<HTMLElement>) => {
                if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return
                if (lit.current === e.currentTarget) unlight()
                onHover?.(null)
              },
              onDrop: (e: DragEvent<HTMLElement>) => {
                const src = source.current
                if (!src) return
                e.preventDefault()
                e.stopPropagation()
                const target = resolve(e, src)
                finish()
                onHover?.(null)
                if (target) handler.current(src, target)
              },
            }
          : {},
    }),
    [enabled, finish, unlight],
  )
}
