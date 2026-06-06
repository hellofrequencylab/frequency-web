'use client'

import { useState, type DragEvent } from 'react'

// Drag-to-reorder for an ordered list (kit), dependency-free (HTML5 DnD). Pair with
// up/down buttons via `move` for touch/a11y. The caller renders items and spreads
// `itemProps(id)` on each; `onReorder` receives the new array to persist. See
// docs/STUDIO.md §2.

export function useSortable<T>(
  items: T[],
  idOf: (t: T) => string,
  onReorder: (next: T[]) => void,
) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const reset = () => { setDragId(null); setOverId(null) }

  const itemProps = (id: string) => ({
    draggable: true,
    onDragStart: () => setDragId(id),
    onDragOver: (e: DragEvent) => { e.preventDefault(); setOverId(id) },
    onDragEnd: reset,
    onDrop: () => {
      if (!dragId || dragId === id) { reset(); return }
      const from = items.findIndex((x) => idOf(x) === dragId)
      const to = items.findIndex((x) => idOf(x) === id)
      reset()
      if (from < 0 || to < 0) return
      const next = [...items]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      onReorder(next)
    },
  })

  /** Keyboard/touch fallback: nudge an item up (-1) or down (1). */
  const move = (id: string, dir: -1 | 1) => {
    const idx = items.findIndex((x) => idOf(x) === id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= items.length) return
    const next = [...items]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    onReorder(next)
  }

  return {
    itemProps,
    move,
    isDragging: (id: string) => dragId === id,
    isOver: (id: string) => overId === id && dragId !== id,
  }
}
