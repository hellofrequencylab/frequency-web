'use client'

import { useState, useTransition } from 'react'
import { Check, GripVertical, Eye, EyeOff } from 'lucide-react'
import { RAIL_BLOCKS, type RailLayout } from '@/lib/circles/rail-layout'

// Shared drag-and-drop + show/hide editor for the circle right-rail layout. Native HTML5
// DnD (no extra dependency); each row carries a visibility toggle. Generic over WHERE the
// layout is saved — the host module binds it to its circle (saveSidebarOrder) and the
// operator module binds it to the global default (saveCircleRailDefault). Builds its rows
// from the saved order first, then appends any blocks the saved order doesn't mention, so a
// newly added rail block always shows up here.

type Row = { key: string; label: string; visible: boolean }

const KEY_ORDER: string[] = RAIL_BLOCKS.map((b) => b.key)
const LABEL_OF = (k: string) => RAIL_BLOCKS.find((b) => b.key === k)?.label ?? k

function buildRows(initial: RailLayout | null): Row[] {
  const hidden = new Set(initial?.hidden ?? [])
  const saved = (initial?.order ?? []).filter((k) => KEY_ORDER.includes(k))
  const appended = KEY_ORDER.filter((k) => !saved.includes(k))
  return [...saved, ...appended].map((k) => ({ key: k, label: LABEL_OF(k), visible: !hidden.has(k) }))
}

export function RailLayoutEditor({
  initial,
  save,
  description,
}: {
  initial: RailLayout | null
  save: (layout: RailLayout) => Promise<{ error?: string } | void>
  /** Optional helper line under the editor's controls. */
  description?: string
}) {
  const [rows, setRows] = useState<Row[]>(() => buildRows(initial))
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function move(from: string, to: string) {
    if (from === to) return
    setRows((prev) => {
      const next = [...prev]
      const fromIdx = next.findIndex((r) => r.key === from)
      const toIdx = next.findIndex((r) => r.key === to)
      if (fromIdx === -1 || toIdx === -1) return prev
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }

  function toggle(key: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, visible: !r.visible } : r)))
  }

  function handleSave() {
    setError(null)
    const layout: RailLayout = {
      order: rows.map((r) => r.key),
      hidden: rows.filter((r) => !r.visible).map((r) => r.key),
    }
    start(async () => {
      const res = await save(layout)
      if (res && 'error' in res && res.error) setError(res.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <div>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li
            key={row.key}
            draggable
            onDragStart={() => setDragKey(row.key)}
            onDragEnd={() => setDragKey(null)}
            onDragOver={(e) => {
              e.preventDefault()
              if (dragKey && dragKey !== row.key) move(dragKey, row.key)
            }}
            onDrop={(e) => e.preventDefault()}
            className={`flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors ${
              dragKey === row.key ? 'opacity-50' : 'hover:border-border-strong'
            } ${row.visible ? 'text-text' : 'text-subtle'}`}
          >
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-subtle active:cursor-grabbing" aria-hidden />
            <span className="flex-1 font-medium">{row.label}</span>
            {!row.visible && <span className="text-2xs font-medium uppercase tracking-wide text-subtle">Hidden</span>}
            <button
              type="button"
              onClick={() => toggle(row.key)}
              aria-label={row.visible ? `Hide ${row.label}` : `Show ${row.label}`}
              aria-pressed={!row.visible}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-elevated hover:text-text"
            >
              {row.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-2xs text-subtle">{description ?? 'Drag to reorder. Toggle the eye to hide a block.'}</p>
        <div className="flex shrink-0 items-center gap-2">
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
            {pending ? 'Saving…' : 'Save layout'}
          </button>
        </div>
      </div>
    </div>
  )
}
