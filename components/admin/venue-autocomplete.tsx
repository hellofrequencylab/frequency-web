'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Loader2, MapPin, X } from 'lucide-react'
import { searchAddresses, type PlaceResult } from '@/lib/geocode'

// Venue / address typeahead (Event settings overhaul §1). Sibling of
// LocationAutocomplete, but it searches addresses + venues + POIs (not just cities)
// and hands back the FULL structured result so a pick can fill venue + street + city
// + region + country + postal code AND drop the map pin. Keyless Photon via
// lib/geocode (searchAddresses).
//
// A pre-filled `value` (the saved venue name) seeds the input but must NOT trigger a
// search on mount — only real keystrokes do (same gate as LocationAutocomplete).
export function VenueAutocomplete({
  value,
  onPick,
  placeholder = 'Venue name',
  disabled = false,
  className,
}: {
  value?: string | null
  /** The full structured result for the picked place. */
  onPick: (p: PlaceResult) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const [q, setQ] = useState(value ?? '')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<PlaceResult[]>([])
  const boxRef = useRef<HTMLDivElement>(null)
  const touched = useRef(false) // true once the user types — gates the search

  useEffect(() => {
    if (!touched.current) return // don't auto-search the pre-filled venue name
    const term = q.trim()
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      if (term.length < 2) {
        setResults([])
        setOpen(false)
        return
      }
      setLoading(true)
      const r = await searchAddresses(term, ctrl.signal)
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
        aria-label="Search a venue or address"
        disabled={disabled}
        className={
          className ??
          'w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-9 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none disabled:opacity-50'
        }
      />
      {(loading || q) && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-subtle" />
          ) : (
            <button type="button" onClick={() => setQ('')} aria-label="Clear" disabled={disabled}>
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
                  onPick(r)
                  // Prefer the feature's own name for the venue field; fall back to the label.
                  setQ(r.name ?? r.label)
                  setOpen(false)
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-text hover:bg-surface-elevated"
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-strong" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name ?? r.label}</span>
                  {r.label !== r.name && (
                    <span className="block truncate text-xs text-subtle">{r.label}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
