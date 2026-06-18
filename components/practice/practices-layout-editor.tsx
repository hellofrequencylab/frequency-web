'use client'

// Per-user Practices-page layout editor. Mirrors the Journey reorder UI
// (components/journey/v2/journey-advanced.tsx): local { id, enabled }[] state, an
// array-swap move(id, ±1), a toggle(id), and a persist() that calls the own-profile
// server action inside a transition then refreshes. Tucked behind a "Customize this page"
// disclosure so it stays out of the way until a member wants it. Autosaves on every change
// (move/toggle), the same pattern as the Journey editor.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, Eye, EyeOff, SlidersHorizontal } from 'lucide-react'
import { setPracticesLayoutAction } from '@/app/(main)/practices/layout-actions'
import { editorPracticesConfig, WIDGET_META, type PracticesWidgetId } from '@/lib/practices-page-config'
import type { PageWidgetConfig } from '@/lib/journey-plans'

interface Row {
  id: PracticesWidgetId
  enabled: boolean
}

export function PracticesLayoutEditor({ initial }: { initial: PageWidgetConfig[] }) {
  const router = useRouter()
  const [, start] = useTransition()
  const [rows, setRows] = useState<Row[]>(() =>
    editorPracticesConfig(initial).map((c) => ({ id: c.id, enabled: c.enabled })),
  )

  const persist = (next: Row[]) => {
    setRows(next)
    start(async () => {
      await setPracticesLayoutAction(next as PageWidgetConfig[])
      router.refresh()
    })
  }

  const toggle = (id: PracticesWidgetId) => {
    persist(rows.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)))
  }

  const move = (id: PracticesWidgetId, dir: -1 | 1) => {
    const i = rows.findIndex((r) => r.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    persist(next)
  }

  return (
    <details className="group space-y-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-text">
          <SlidersHorizontal className="h-4 w-4 text-subtle" /> Customize this page
        </span>
        <ChevronDown className="h-4 w-4 text-subtle transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      <p className="text-xs text-muted">Reorder or hide the blocks on your Practices page. Changes save automatically.</p>

      <ul className="space-y-1">
        {rows.map((r, i) => {
          const meta = WIDGET_META[r.id]
          return (
            <li key={r.id} className="flex items-center gap-2 rounded-lg border border-border bg-canvas px-2.5 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text">{meta.label}</span>
                <span className="block truncate text-xs text-muted">{meta.hint}</span>
              </span>
              <button
                type="button"
                onClick={() => move(r.id, -1)}
                disabled={i === 0}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-subtle hover:text-text disabled:opacity-30"
                aria-label="Move up"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(r.id, 1)}
                disabled={i === rows.length - 1}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-subtle hover:text-text disabled:opacity-30"
                aria-label="Move down"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => toggle(r.id)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded ${r.enabled ? 'text-primary-strong' : 'text-subtle'} hover:text-text`}
                aria-label={r.enabled ? 'Hide' : 'Show'}
                title={r.enabled ? 'Shown' : 'Hidden'}
              >
                {r.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
