'use client'

// The URL-driven library controls that aren't single-select FacetDropdowns: the search box,
// the sort + direction control, the tristate flag toggles (Public / Template / Featured), the
// computed-gap toggles, "Clear filters", and the localStorage-backed Saved views. Every one
// reads + writes the page's searchParams (the server fetch is driven entirely by the URL), so
// the page stays server-rendered and a filtered view is a shareable link. Selection + the bulk
// bar live in practices-table.tsx; this file owns the filter/sort surface only.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Bookmark, ChevronDown, Search, Trash2, X } from 'lucide-react'

// The filter/sort params the controls own. Paging cursors (cursor/page) are reset whenever a
// filter changes so a stale cursor can never point past the new, smaller result set.
const FILTER_KEYS = [
  'q', 'pillar', 'sub', 'status', 'weight', 'creator', 'tag',
  'public', 'template', 'featured', 'noImage', 'noBody', 'neverLogged', 'noPillar',
  'sort', 'dir',
] as const
const PAGING_KEYS = ['cursor', 'page'] as const

// The sort vocabulary the server read accepts (AdminPracticeSort) plus the page's az/za split
// into one "Title" key with a direction toggle, so the control reads as "sort + direction".
const SORTS: { value: string; label: string }[] = [
  { value: 'score', label: 'Best (usage score)' },
  { value: 'logs', label: 'Logs (all time)' },
  { value: 'adopters', label: 'Adopters' },
  { value: 'new', label: 'Recently added' },
  { value: 'title', label: 'Title' },
]

function useUrlState() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  // Push a patch of param changes (null clears a key). Always resets the paging cursor so a
  // filter change starts at the first page of the new set.
  const patch = useCallback(
    (changes: Record<string, string | null>, opts?: { keepPaging?: boolean }) => {
      const params = new URLSearchParams(sp.toString())
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === '') params.delete(k)
        else params.set(k, v)
      }
      if (!opts?.keepPaging) for (const k of PAGING_KEYS) params.delete(k)
      const s = params.toString()
      router.push(s ? `${pathname}?${s}` : pathname)
    },
    [router, pathname, sp],
  )

  return { sp, pathname, patch }
}

// --- Search box ---------------------------------------------------------------

export function PracticeSearchBox() {
  const { sp, patch } = useUrlState()
  const urlQ = sp.get('q') ?? ''
  const [value, setValue] = useState(urlQ)
  // Keep the input in step when the URL changes from elsewhere (a saved view, Clear) WITHOUT an
  // effect — the "store the previous prop" pattern (react.dev "you might not need an effect").
  const [seenUrlQ, setSeenUrlQ] = useState(urlQ)
  if (urlQ !== seenUrlQ) {
    setSeenUrlQ(urlQ)
    setValue(urlQ)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    patch({ q: value.trim() || null })
  }

  return (
    <form onSubmit={submit} className="relative min-w-[12rem] flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search title, summary, or description"
        aria-label="Search practices"
        className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </form>
  )
}

// --- Sort + direction ---------------------------------------------------------

export function PracticeSortControl() {
  const { sp, patch } = useUrlState()
  const sort = sp.get('sort') || 'score'
  const dir = sp.get('dir') === 'asc' ? 'asc' : 'desc'

  return (
    <div className="flex items-center gap-1.5">
      <label className="text-xs font-medium text-muted" htmlFor="practice-sort">Sort</label>
      <select
        id="practice-sort"
        value={sort}
        onChange={(e) => patch({ sort: e.target.value === 'score' ? null : e.target.value })}
        className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => patch({ dir: dir === 'asc' ? null : 'asc' })}
        aria-label={dir === 'asc' ? 'Sorted ascending. Switch to descending' : 'Sorted descending. Switch to ascending'}
        title={dir === 'asc' ? 'Ascending' : 'Descending'}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-border-strong hover:text-text"
      >
        {dir === 'asc'
          ? <ArrowUpNarrowWide className="h-4 w-4" aria-hidden />
          : <ArrowDownWideNarrow className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  )
}

// --- Tristate flag + computed-gap toggles -------------------------------------

// A tristate filter chip: off (no filter) → on (true) → off again. For the flag filters the
// "on" state means "only practices where this flag is true" (Public / Template / Featured).
function ToggleChip({
  paramKey, label, value,
}: { paramKey: string; label: string; value: 'true' | 'false' }) {
  const { sp, patch } = useUrlState()
  const active = sp.get(paramKey) === value
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => patch({ [paramKey]: active ? null : value })}
      className={`inline-flex min-h-[2rem] items-center rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors motion-reduce:transition-none ${
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted hover:border-border-strong hover:text-text'
      }`}
    >
      {label}
    </button>
  )
}

export function PracticeFlagFilters() {
  return (
    <div className="flex flex-wrap gap-1.5">
      <ToggleChip paramKey="public" label="Public" value="true" />
      <ToggleChip paramKey="template" label="Template" value="true" />
      <ToggleChip paramKey="featured" label="Featured" value="true" />
    </div>
  )
}

export function PracticeComputedFilters({
  counts,
}: {
  counts: { no_image: number; no_body: number; never_logged: number; no_pillar: number }
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <ToggleChip paramKey="noImage" label={`No image (${counts.no_image})`} value="true" />
      <ToggleChip paramKey="noBody" label={`No steps (${counts.no_body})`} value="true" />
      <ToggleChip paramKey="neverLogged" label={`Never logged (${counts.never_logged})`} value="true" />
      <ToggleChip paramKey="noPillar" label={`No Pillar (${counts.no_pillar})`} value="true" />
    </div>
  )
}

// --- Clear filters ------------------------------------------------------------

export function PracticeClearFilters() {
  const { sp, patch } = useUrlState()
  const hasFilters = FILTER_KEYS.some((k) => sp.get(k))
  if (!hasFilters) return null
  return (
    <button
      type="button"
      onClick={() => patch(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}
      className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-text"
    >
      <X className="h-3 w-3" aria-hidden /> Clear filters
    </button>
  )
}

// --- Saved views (localStorage, member-local) ---------------------------------
//
// A saved view is the current filter/sort combo captured as its URL query string under a name,
// persisted in localStorage (no migration — this is member-local, per PRACTICE-LIBRARY §7; a
// server-backed shared view is a documented follow-up). Re-applying a view replaces the whole
// query string, so it restores exactly the saved filters (and clears anything not in them).

const STORAGE_KEY = 'admin.practices.savedViews.v1'

interface SavedView {
  name: string
  /** The query string (without the leading '?'), e.g. "status=pending&sort=new". */
  query: string
}

function readViews(): SavedView[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((v): v is SavedView => v && typeof v.name === 'string' && typeof v.query === 'string')
      .slice(0, 50)
  } catch {
    return []
  }
}

function writeViews(views: SavedView[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views.slice(0, 50)))
  } catch {
    // Quota / private mode — saved views are a convenience, never block the page.
  }
}

export function PracticeSavedViews() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [open, setOpen] = useState(false)
  // Lazy init from localStorage. Safe against a hydration mismatch: the views list only renders
  // inside the menu (closed by default), so it is never part of the server-rendered HTML.
  const [views, setViews] = useState<SavedView[]>(() => readViews())
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

  // The current query, minus paging cursors (a view is filters + sort, not a page position).
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

  function apply(view: SavedView) {
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
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-primary"
      >
        <Bookmark className="h-3.5 w-3.5" aria-hidden />
        <span>Saved views</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Saved views"
          className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-surface p-1 shadow-pop"
        >
          <button
            type="button"
            onClick={save}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-primary-strong transition-colors hover:bg-surface-elevated"
          >
            <Bookmark className="h-3.5 w-3.5" aria-hidden /> Save the current view
          </button>
          {views.length > 0 && <div className="my-1 h-px bg-border" aria-hidden />}
          <div className="max-h-60 overflow-y-auto">
            {views.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-subtle">No saved views yet.</p>
            ) : (
              views.map((view) => (
                <div
                  key={view.name}
                  className="group flex items-center gap-1 rounded-lg pl-2.5 pr-1 transition-colors hover:bg-surface-elevated"
                >
                  <button
                    type="button"
                    onClick={() => apply(view)}
                    className="min-w-0 flex-1 truncate py-1.5 text-left text-xs text-text"
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
