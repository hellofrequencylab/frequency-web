'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { Check, ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { getPageLayoutForEditor, savePageLayout, type LayoutEditorItem } from '@/lib/page-settings/actions'

// The live Layout editor for the on-page "Page" settings panel (ADR-270). Loads every known
// module for the current route in resolved order (staff-gated server action), each flagged
// visible or not. Staff toggle which modules show and reorder them; the saved item order IS
// the rendered order and a disabled item is hidden. Writes back to the per-route layout store.
export function LayoutEditor() {
  const pathname = usePathname()
  const [items, setItems] = useState<LayoutEditorItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    getPageLayoutForEditor(pathname)
      .then((d) => {
        if (!active) return
        setItems(d)
        setLoading(false)
      })
      .catch(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [pathname])

  function toggle(id: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, enabled: !it.enabled } : it)))
  }

  function move(index: number, delta: number) {
    setItems((prev) => {
      const next = index + delta
      if (next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      const [item] = copy.splice(index, 1)
      copy.splice(next, 0, item)
      return copy
    })
  }

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const r = await savePageLayout(pathname, items.map(({ id, enabled }) => ({ id, enabled })))
      if (isError(r)) setError(r.error)
      else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  if (loading) {
    return <div className="h-44 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs text-muted">No modules available for this page yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface-elevated/50 p-3"
          >
            <button
              type="button"
              onClick={() => toggle(item.id)}
              disabled={pending}
              aria-label={item.enabled ? `Hide ${item.label}` : `Show ${item.label}`}
              aria-pressed={item.enabled}
              className={`shrink-0 rounded-lg p-1.5 transition-colors disabled:opacity-40 ${
                item.enabled ? 'text-primary-strong hover:text-primary-hover' : 'text-subtle hover:text-text'
              }`}
            >
              {item.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-semibold ${item.enabled ? 'text-text' : 'text-muted'}`}>
                {item.label}
              </p>
              {item.description && <p className="truncate text-xs text-muted">{item.description}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={pending || index === 0}
                aria-label={`Move ${item.label} up`}
                className="rounded-lg p-1.5 text-muted transition-colors hover:text-text disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={pending || index === items.length - 1}
                aria-label={`Move ${item.label} down`}
                className="rounded-lg p-1.5 text-muted transition-colors hover:text-text disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        {saved && (
          <span className="flex items-center gap-1 text-xs font-medium text-primary-strong">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
