'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Loader2, MapPin, X } from 'lucide-react'
import { searchVenues, type PlaceResult } from '@/lib/geocode'
import { getBrowserPosition } from '@/lib/geo-browser'

// Device location, requested at most ONCE per page load and shared across every autocomplete on
// the page (a member usually only sees one, but a remount must not re-prompt). The browser's own
// permission dialog is the gate; we cache the resolved promise so later focuses reuse it.
let devicePositionPromise: Promise<{ lat: number; lng: number } | null> | null = null
function requestDevicePosition(): Promise<{ lat: number; lng: number } | null> {
  if (!devicePositionPromise) devicePositionPromise = getBrowserPosition()
  return devicePositionPromise
}

/** Lazily geolocate the device. `request()` is idempotent and fire-and-forget — call it on focus /
 *  first keystroke; it NEVER blocks typing (the permission prompt resolves in its own time, and if
 *  denied/unavailable the value just stays null). `location` fills in once/if the device resolves. */
function useDeviceLocation(): { location: { lat: number; lng: number } | null; request: () => void } {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const asked = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const request = useCallback(() => {
    if (asked.current) return
    asked.current = true
    void requestDevicePosition().then((p) => {
      if (p && mounted.current) setLocation(p)
    })
  }, [])
  return { location, request }
}

// Venue / address typeahead (Event settings overhaul §1). Sibling of
// LocationAutocomplete, but it searches addresses + venues + POIs (not just cities)
// and hands back the FULL structured result so a pick can fill venue + street + city
// + region + country + postal code AND drop the map pin. Server-side Nominatim via
// lib/geocode (searchVenues → /api/geocode/venues), local-first so a typed local
// street surfaces the nearby address rather than a same-named place worldwide.
//
// A pre-filled `value` (the saved venue name) seeds the input but must NOT trigger a
// search on mount — only real keystrokes do (same gate as LocationAutocomplete).
export function VenueAutocomplete({
  value,
  onPick,
  placeholder = 'Venue name',
  disabled = false,
  className,
  bias,
}: {
  value?: string | null
  /** The full structured result for the picked place. */
  onPick: (p: PlaceResult) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Location bias — results near this point rank first (the current pin, or the viewer's home). */
  bias?: { lat: number; lng: number } | null
}) {
  const [q, setQ] = useState(value ?? '')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<PlaceResult[]>([])
  const boxRef = useRef<HTMLDivElement>(null)
  const touched = useRef(false) // true once the user types — gates the search
  const { location: deviceLocation, request: requestLocation } = useDeviceLocation()
  // Effective bias, best-first: the device's own location (closest to where the member actually is)
  // → the event's current pin (`bias`) → unbiased. `searchVenues` draws the hard local viewbox and
  // the closest-first sort from whichever wins. Held in a ref so a fresh object each render never
  // re-arms the debounce (the search effect only depends on the typed query).
  const effectiveBias = deviceLocation ?? bias ?? null
  const biasRef = useRef(effectiveBias)
  useEffect(() => {
    biasRef.current = effectiveBias
  }, [effectiveBias])

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
      const r = await searchVenues(term, ctrl.signal, biasRef.current)
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
          requestLocation() // lazy geolocate on first keystroke; never blocks typing
          setQ(e.target.value)
        }}
        onFocus={() => {
          requestLocation() // start the (async) permission prompt as soon as they engage
          if (results.length > 0) setOpen(true)
        }}
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
