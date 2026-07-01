'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ArrowUpDown, Check } from 'lucide-react'

// The Spaces catalog sort control — the same URL-driven idiom as the Events sort (events-sort.tsx):
// a single-select menu that writes the `sort` search param and preserves the rest, so the catalog
// stays a Server Component and a sorted view is shareable. The trigger reads "Sort: Name" rather
// than swapping to the chosen value. Options are fixed here (Name / Newest / Most members); the
// lister (lib/spaces/discovery) owns the actual ordering.

export type SpaceSortOption = { value: string; label: string }

// Name (A–Z) is the default and canonical order, so choosing it drops the param (a clean URL).
export const SPACE_SORT_OPTIONS: SpaceSortOption[] = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'newest', label: 'Newest' },
  { value: 'members', label: 'Most members' },
]

export function SpacesSort({
  options = SPACE_SORT_OPTIONS,
  defaultValue = 'name',
}: {
  options?: SpaceSortOption[]
  defaultValue?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const current = sp.get('sort') ?? defaultValue
  const currentLabel = options.find((o) => o.value === current)?.label ?? options[0]?.label

  const [open, setOpen] = useState(false)
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

  function choose(value: string) {
    const params = new URLSearchParams(sp.toString())
    // The default sort is implicit — drop the param so the canonical URL stays clean.
    if (value === defaultValue) params.delete('sort')
    else params.set('sort', value)
    const s = params.toString()
    router.push(s ? `${pathname}?${s}` : pathname)
    setOpen(false)
  }

  const active = current !== defaultValue

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
          active
            ? 'border-primary bg-primary-bg text-primary-strong'
            : 'border-border bg-surface text-muted hover:border-primary'
        }`}
      >
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
        <span>Sort: {currentLabel}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Sort Spaces"
          className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-border bg-surface p-1 shadow-pop"
        >
          {options.map((o) => {
            const isSel = o.value === current
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => choose(o.value)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-surface-elevated ${
                  isSel ? 'font-semibold text-primary-strong' : 'text-text'
                }`}
              >
                <span className="min-w-0 truncate">{o.label}</span>
                {isSel && <Check className="h-3.5 w-3.5 shrink-0 text-primary-strong" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
