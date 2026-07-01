'use client'

// The HOME screen of the mobile editor: the block list. Single column, full width,
// each row renders the block styled (the list IS a low-fi preview) with a title +
// summary and a tap affordance. Supports:
//   · tap a row              -> the parent pushes that block's edit screen
//   · swipe a row left       -> delete (with an Undo snackbar, owned by the parent)
//   · long-press + drag      -> reorder inline (also available via a Reorder toggle)
//
// In "reorder" mode rows collapse to a compact title + a big drag handle. Drag is
// pointer-based (works on touch + mouse) with a visible insertion line; there is
// always a visible fallback (the Reorder toggle), never gesture-only.

import { useRef, useState } from 'react'
import { ChevronRight, GripVertical } from 'lucide-react'
import type { Config, Data } from '@measured/puck'
import { Render } from '@measured/puck'
import { blockSummary, blockTitle, itemId } from './data-ops'

type Item = Data['content'][number]

// Render ONE block in isolation as a low-fi preview, by handing <Render> a
// single-item document. Non-interactive (pointer-events off) so taps hit the row.
// `metadata` is threaded through so asset-backed blocks (e.g. the Spotlight image /
// gallery, which derive their URL from `metadata.spotlight.publicBase`) resolve here
// instead of rendering broken images against an empty base.
function BlockPreview({ config, item, metadata }: { config: Config; item: Item; metadata?: Record<string, unknown> }) {
  const doc: Data = { root: {}, content: [item] }
  return (
    <div className="pointer-events-none max-h-40 overflow-hidden [zoom:0.5]" aria-hidden>
      <Render config={config} data={doc} metadata={metadata} />
    </div>
  )
}

function SwipeRow({
  children,
  onDelete,
}: {
  children: React.ReactNode
  onDelete: () => void
}) {
  const [dx, setDx] = useState(0)
  const start = useRef<number | null>(null)
  const swiped = useRef(false)

  return (
    <div className="relative overflow-hidden">
      {/* Delete affordance revealed behind the row as it slides left. */}
      <div className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-danger text-sm font-semibold text-white">
        Delete
      </div>
      <div
        className="relative bg-canvas transition-transform"
        style={{ transform: `translateX(${dx}px)` }}
        onTouchStart={(e) => {
          start.current = e.touches[0].clientX
          swiped.current = false
        }}
        onTouchMove={(e) => {
          if (start.current === null) return
          const delta = e.touches[0].clientX - start.current
          if (Math.abs(delta) > 8) swiped.current = true
          setDx(Math.min(0, Math.max(-96, delta)))
        }}
        onTouchEnd={() => {
          if (dx < -64) onDelete()
          setDx(0)
          start.current = null
        }}
        // Swallow the click that a horizontal swipe would otherwise fire on the row's
        // edit button, so a swipe never accidentally opens the block.
        onClickCapture={(e) => {
          if (swiped.current) {
            e.stopPropagation()
            e.preventDefault()
            swiped.current = false
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function BlockList({
  config,
  data,
  metadata,
  reordering,
  onOpen,
  onDelete,
  onMove,
}: {
  config: Config
  data: Data
  /** Puck render metadata, threaded to each block's low-fi preview (see BlockPreview). */
  metadata?: Record<string, unknown>
  reordering: boolean
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  /** Commit a reorder from index -> index. */
  onMove: (from: number, to: number) => void
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const longPress = useRef<number | null>(null)
  // Set true once a long-press drag begins, so the click that follows the release
  // does not also open the block for editing.
  const didDrag = useRef(false)

  const items = data.content

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-base font-medium text-text">Nothing here yet.</p>
        <p className="mt-1 text-sm text-muted">Add your first block.</p>
      </div>
    )
  }

  function beginDrag(index: number) {
    didDrag.current = true
    setDragFrom(index)
    setDragOver(index)
  }

  function pointerMoveToRow(clientY: number, container: HTMLElement) {
    const rows = Array.from(container.querySelectorAll('[data-row]')) as HTMLElement[]
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect()
      if (clientY < r.top + r.height / 2) return i
    }
    return rows.length - 1
  }

  return (
    <ul
      className="divide-y divide-border"
      onPointerMove={(e) => {
        if (dragFrom === null) return
        setDragOver(pointerMoveToRow(e.clientY, e.currentTarget as HTMLElement))
      }}
      onPointerUp={() => {
        if (dragFrom !== null && dragOver !== null && dragFrom !== dragOver) {
          onMove(dragFrom, dragOver)
        }
        setDragFrom(null)
        setDragOver(null)
      }}
    >
      {items.map((item, index) => {
        const id = itemId(item)
        const title = blockTitle(config, item)
        const dragging = dragFrom === index
        const showLine = dragFrom !== null && dragOver === index && dragFrom !== index

        // Compact reorder row: title + big drag handle.
        if (reordering) {
          return (
            <li key={id} data-row className={showLine ? 'border-t-2 border-t-primary' : ''}>
              <div
                className={`flex min-h-[56px] items-center gap-3 px-4 ${dragging ? 'opacity-50' : ''}`}
              >
                <button
                  type="button"
                  aria-label={`Drag ${title} to reorder`}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-elevated"
                  onPointerDown={() => beginDrag(index)}
                >
                  <GripVertical className="h-6 w-6" aria-hidden />
                </button>
                <span className="truncate text-sm font-medium text-text">{title}</span>
              </div>
            </li>
          )
        }

        // Normal row: low-fi preview + tap to edit, swipe to delete, long-press to drag.
        return (
          <li key={id} data-row className={showLine ? 'border-t-2 border-t-primary' : ''}>
            <SwipeRow onDelete={() => onDelete(id)}>
              <button
                type="button"
                onClick={() => {
                  if (didDrag.current) {
                    didDrag.current = false
                    return
                  }
                  onOpen(id)
                }}
                onPointerDown={() => {
                  didDrag.current = false
                  longPress.current = window.setTimeout(() => beginDrag(index), 450)
                }}
                onPointerUp={() => {
                  if (longPress.current) window.clearTimeout(longPress.current)
                }}
                onPointerLeave={() => {
                  if (longPress.current) window.clearTimeout(longPress.current)
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-elevated ${
                  dragging ? 'opacity-50' : ''
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">{title}</span>
                  {blockSummary(item) && (
                    <span className="mt-0.5 block truncate text-xs text-muted">{blockSummary(item)}</span>
                  )}
                  <span className="mt-2 block rounded-lg border border-border bg-surface">
                    <BlockPreview config={config} item={item} metadata={metadata} />
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 self-start text-subtle" aria-hidden />
              </button>
            </SwipeRow>
          </li>
        )
      })}
    </ul>
  )
}
