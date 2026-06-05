'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Loader2, MapPin, X } from 'lucide-react'
import { searchPlaces, type PlaceSuggestion } from '@/lib/geocode'

// A pre-filled `value` (e.g. the wizard's default area) seeds the input but must
// NOT trigger a search or pop the dropdown on mount — only what the user actually
// types should. We skip the debounced search until the first real keystroke.

// Reusable city/town typeahead (Photon / OpenStreetMap via lib/geocode). As you
// type, populated-place suggestions appear; picking one calls onPick with the
// label + lat/lng. Same pattern as the circles location search.
export function LocationAutocomplete({
  value,
  onPick,
  placeholder = 'Search a city or town…',
}: {
  value?: string | null
  onPick: (p: { label: string; lat: number; lng: number }) => void
  placeholder?: string
}) {
  const [q, setQ] = useState(value ?? '')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const boxRef = useRef<HTMLDivElement>(null)
  const touched = useRef(false) // true once the user has typed — gates the search

  useEffect(() => {
    if (!touched.current) return // don't auto-search the pre-filled default value
    const term = q.trim()
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      if (term.length < 2) {
        setResults([])
        setOpen(false)
        return
      }
      setLoading(true)
      const r = await searchPlaces(term, ctrl.signal)
      setResults(r)
      setLoading(false)
      setOpen(true)
    }, 280)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
      <input
        type="text"
        value={q}
        onChange={(e) => {
          touched.current = true
          setQ(e.target.value)
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        aria-label="Search a location"
        className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-9 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none"
      />
      {(loading || q) && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-subtle" />
          ) : (
            <button type="button" onClick={() => setQ('')} aria-label="Clear">
              <X className="h-4 w-4 text-subtle hover:text-text" />
            </button>
          )}
        </span>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {results.map((r) => (
            <li key={r.label}>
              <button
                type="button"
                onClick={() => {
                  onPick({ label: r.label, lat: r.lat, lng: r.lng })
                  setQ(r.label)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-surface-elevated"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary-strong" />
                <span className="truncate">{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
