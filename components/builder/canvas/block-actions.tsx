'use client'

// WHAT YOU CAN DO TO THE SELECTED BLOCK (PROG-E6C): make a copy under it, hide it from the page or show it again,
// take it off the page, and undo the last change to the page's shape. Each goes through the canvas's one draft
// write (use-canvas-document.ts). A removed block is kept in the Space page builder's tray with its words, so
// Remove needs no confirm: Undo puts it back. Every target is 44px, the row wraps on a phone, and nothing waits
// on hover.

import { Button } from '@/components/ui/button'

export function BlockActions({
  title, hidden, off, undoLabel, onDuplicate, onToggleHidden, onRemove, onUndo,
}: {
  /** The selected block's name, or null when nothing is selected. */
  title: string | null
  hidden: boolean
  /** Why nothing can change right now (a read-only page, a stale tab), or null. */
  off: string | null
  /** What Undo takes back, in words, or null when there is nothing to undo. */
  undoLabel: string | null
  onDuplicate: () => void
  onToggleHidden: () => void
  onRemove: () => void
  onUndo: () => void
}) {
  const blocked = off !== null || title === null
  return (
    <section aria-label="Block actions" className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2" data-block-actions="">
        <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={blocked} aria-label={title ? `Duplicate ${title}` : 'Duplicate'} onClick={onDuplicate}>
          Duplicate
        </Button>
        <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={blocked} aria-pressed={hidden} aria-label={title ? `${hidden ? 'Show' : 'Hide'} ${title}` : 'Hide'} onClick={onToggleHidden}>
          {hidden ? 'Show' : 'Hide'}
        </Button>
        <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={blocked} aria-label={title ? `Remove ${title}` : 'Remove'} onClick={onRemove}>
          Remove
        </Button>
        <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={off !== null || undoLabel === null} onClick={onUndo}>
          {undoLabel ?? 'Undo'}
        </Button>
      </div>
      <p className="text-meta text-muted">
        {off ?? (hidden ? `${title} is hidden: it keeps its place, and the page skips it.` : 'Remove keeps the block in the page builder tray, so Undo can put it back.')}
      </p>
    </section>
  )
}
