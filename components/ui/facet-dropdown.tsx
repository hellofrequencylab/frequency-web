'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ChevronDown, Search, Check } from 'lucide-react'

export type FacetOption = { value: string; label: string }

// Standardized faceted-filter control for every directory on the site (people,
// circles, …). One compact button per facet that opens a searchable single-select
// panel — the best-practice answer to high-cardinality facets (dozens of regions
// or circles) that would otherwise sprawl as inline chip rows. URL-driven (the
// directory pages stay server-rendered and shareable): selecting sets/clears one
// search param and preserves the rest.
export function FacetDropdown({
  label,
  paramKey,
  options,
  searchable,
  align = 'left',
}: {
  label: string
  paramKey: string
  options: FacetOption[]
  /** Show the in-panel search box. Defaults on past ~8 options. */
  searchable?: boolean
  align?: 'left' | 'right'
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const selected = sp.get(paramKey) ?? ''
  const selectedLabel = options.find((o) => o.value === selected)?.label

  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const showSearch = searchable ?? options.length > 8

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

  function choose(value: string | null) {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(paramKey, value)
    else params.delete(paramKey)
    const s = params.toString()
    router.push(s ? `${pathname}?${s}` : pathname)
    setOpen(false)
    setQ('')
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options
  }, [q, options])

  const active = !!selected

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
        <span>{active ? selectedLabel : label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className={`absolute top-full z-50 mt-1 w-60 rounded-xl border border-border bg-surface p-1 shadow-pop ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {showSearch && (
            <div className="relative mb-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="w-full rounded-lg border border-border bg-surface-elevated py-1.5 pl-8 pr-2 text-xs text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
              />
            </div>
          )}

          <div className="max-h-60 overflow-y-auto">
            <button
              type="button"
              onClick={() => choose(null)}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-surface-elevated ${
                !active ? 'font-semibold text-primary-strong' : 'text-text'
              }`}
            >
              All {label.toLowerCase()}
              {!active && <Check className="h-3.5 w-3.5 text-primary-strong" />}
            </button>
            {filtered.map((o) => {
              const isSel = o.value === selected
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
            {filtered.length === 0 && (
              <p className="px-2.5 py-2 text-xs text-subtle">No matches.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
