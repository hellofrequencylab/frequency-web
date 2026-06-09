'use client'

import { useState, useTransition } from 'react'
import { Check, GripVertical } from 'lucide-react'
import { saveSidebarOrder } from '@/app/(main)/circles/admin-actions'

// Slim drag-and-drop reorder for the circle's right-rail blocks. Native HTML5 DnD
// (no extra dependency) — each row is draggable; dropping over another row moves the
// dragged key to that position. "Save order" persists via saveSidebarOrder, which
// re-checks circle.editSettings server-side.

const BLOCK_LABELS: Record<string, string> = {
  members: 'Members',
  health: 'Circle health',
  practice: "This week's practice",
  events: 'Upcoming events',
  invite: 'Invite a friend',
}

const DEFAULT_ORDER = ['members', 'health', 'practice', 'events', 'invite']

export function SidebarWidgetEditor({
  circleId,
  slug,
  order,
}: {
  circleId: string
  slug: string
  order: string[] | null
}) {
  // Start from the saved order, restricted to known keys, then append any known
  // blocks that aren't in the saved order so a newly-added block never goes missing.
  const initial = (() => {
    const saved = (order ?? DEFAULT_ORDER).filter((k) => k in BLOCK_LABELS)
    const missing = DEFAULT_ORDER.filter((k) => !saved.includes(k))
    return [...saved, ...missing]
  })()

  const [items, setItems] = useState<string[]>(initial)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function move(from: string, to: string) {
    if (from === to) return
    setItems((prev) => {
      const next = [...prev]
      const fromIdx = next.indexOf(from)
      const toIdx = next.indexOf(to)
      if (fromIdx === -1 || toIdx === -1) return prev
      next.splice(fromIdx, 1)
      next.splice(toIdx, 0, from)
      return next
    })
  }

  function handleSave() {
    setError(null)
    start(async () => {
      try {
        await saveSidebarOrder(circleId, slug, items)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save order.')
      }
    })
  }

  return (
    <section className="border-t border-border pt-5">
      <header className="mb-3 space-y-1">
        <h3 className="text-sm font-bold text-text">Rail layout</h3>
        <p className="text-sm text-muted">Drag to reorder the blocks in this circle&apos;s right rail.</p>
      </header>

      <ul className="space-y-1.5">
        {items.map((key) => (
          <li
            key={key}
            draggable
            onDragStart={() => setDragKey(key)}
            onDragEnd={() => setDragKey(null)}
            onDragOver={(e) => {
              e.preventDefault()
              if (dragKey && dragKey !== key) move(dragKey, key)
            }}
            onDrop={(e) => e.preventDefault()}
            className={`flex cursor-grab items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text transition-colors active:cursor-grabbing ${
              dragKey === key ? 'opacity-50' : 'hover:border-border-strong'
            }`}
          >
            <GripVertical className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
            <span className="font-medium">{BLOCK_LABELS[key]}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-end gap-2">
        {error && <span className="text-xs font-medium text-danger">{error}</span>}
        {saved && (
          <span className="flex items-center gap-1 text-xs font-medium text-primary-strong">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save order'}
        </button>
      </div>
    </section>
  )
}
