'use client'

// Loom Studio saved views (PROG-D4 "organization at scale", ADR-1502). A saved view is the current
// filter/sort/folder combination captured as its URL query string under a name. The Loom is already
// URL-driven (q / kind / category / collection / sort / view), so a view is a named URL and nothing
// more; it lives in localStorage, per operator, per browser, on the precedent of
// app/(main)/admin/content/practices/practices-controls.tsx (member-local, no migration). A
// server-backed shared view earns a table only when operators ask for one. The paging cursor is
// dropped on save: a view is filters + sort, not a page position.

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Bookmark, ChevronDown, Trash2 } from 'lucide-react'

export const LOOM_SAVED_VIEWS_KEY = 'admin.library.savedViews.v1'
const PAGING_KEYS = ['page'] as const
const MAX_VIEWS = 50

export interface LoomSavedView {
  name: string
  /** The query string without the leading '?', e.g. "kind=image&sort=title&view=list". */
  query: string
}

function readViews(): LoomSavedView[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LOOM_SAVED_VIEWS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((v): v is LoomSavedView => !!v && typeof v.name === 'string' && typeof v.query === 'string')
      .slice(0, MAX_VIEWS)
  } catch {
    return []
  }
}

function writeViews(views: LoomSavedView[]) {
  try {
    window.localStorage.setItem(LOOM_SAVED_VIEWS_KEY, JSON.stringify(views.slice(0, MAX_VIEWS)))
  } catch {
    // Quota or private mode: a saved view is a convenience and never blocks the page.
  }
}

export function LoomSavedViews() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [open, setOpen] = useState(false)
  // Lazy init from localStorage. Hydration-safe: the list renders only inside the closed-by-default
  // menu, so it is never part of the server-rendered HTML.
  const [views, setViews] = useState<LoomSavedView[]>(() => readViews())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const currentQuery = useMemo(() => {
    const params = new URLSearchParams(sp.toString())
    for (const k of PAGING_KEYS) params.delete(k)
    return params.toString()
  }, [sp])

  function save() {
    const name = window.prompt('Name this view')?.trim()
    if (!name) return
    const next = [...views.filter((v) => v.name !== name), { name, query: currentQuery }]
    setViews(next)
    writeViews(next)
    setOpen(false)
  }

  function apply(view: LoomSavedView) {
    router.push(view.query ? `${pathname}?${view.query}` : pathname)
    setOpen(false)
  }

  function remove(name: string) {
    const next = views.filter((v) => v.name !== name)
    setViews(next)
    writeViews(next)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-2xl border border-border bg-surface px-3 py-2 text-body-sm font-medium text-muted transition-colors hover:border-primary"
      >
        <Bookmark className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Saved views</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Saved views"
          className="absolute right-0 top-full z-40 mt-1 w-64 rounded-card border border-border bg-surface p-1 shadow-pop"
        >
          <button
            type="button"
            onClick={save}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-meta font-semibold text-primary-strong transition-colors hover:bg-surface-elevated"
          >
            <Bookmark className="h-3.5 w-3.5" aria-hidden /> Save the current view
          </button>
          {views.length > 0 && <div className="my-1 h-px bg-border" aria-hidden />}
          <div className="max-h-60 overflow-y-auto">
            {views.length === 0 ? (
              <p className="px-2.5 py-2 text-meta text-subtle">No saved views yet.</p>
            ) : (
              views.map((view) => (
                <div
                  key={view.name}
                  className="group flex items-center gap-1 rounded-lg pl-2.5 pr-1 transition-colors hover:bg-surface-elevated"
                >
                  <button
                    type="button"
                    onClick={() => apply(view)}
                    className="min-w-0 flex-1 truncate py-1.5 text-left text-meta text-text"
                  >
                    {view.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(view.name)}
                    aria-label={`Delete the saved view ${view.name}`}
                    title={`Delete ${view.name}`}
                    className="shrink-0 rounded-md p-1 text-subtle opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
