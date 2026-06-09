'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Search, LocateFixed, X, Loader2, MapPin } from 'lucide-react'
import { searchPlaces, type PlaceSuggestion } from '@/lib/geocode'

// Smart location search: start typing a city and it autocompletes (Photon /
// OpenStreetMap), or tap "use my location". Choosing a place sets `near` +
// `place` in the URL; the server then renders the nearest REAL circles
// (demo content is excluded by the circles_near RPC). Existing filters on the
// page are preserved.
export function CircleLocationSearch({
  activePlace,
  trailing,
}: {
  activePlace?: string | null
  /** Extra action(s) pinned to the right of "Use my location", on the same
   *  baseline — e.g. the page's "Online now" toggle. Keeps one aligned row. */
  trailing?: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const boxRef = useRef<HTMLDivElement>(null)

  // Debounced autocomplete. All state updates happen inside the timeout (an
  // async callback), never synchronously in the effect body.
  useEffect(() => {
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

  // Dismiss the dropdown on an outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function go(lat: number, lng: number, place: string) {
    const next = new URLSearchParams(params.toString())
    next.set('near', `${lat.toFixed(5)},${lng.toFixed(5)}`)
    next.set('place', place)
    router.push(`${pathname}?${next.toString()}`)
    setOpen(false)
    setQ('')
  }

  function clear() {
    const next = new URLSearchParams(params.toString())
    next.delete('near')
    next.delete('place')
    const s = next.toString()
    router.push(s ? `${pathname}?${s}` : pathname)
  }

  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        go(pos.coords.latitude, pos.coords.longitude, 'your location')
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    )
  }

  return (
    <div className="flex flex-col gap-2">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div ref={boxRef} className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search a city to find circles nearby…"
          aria-label="Search a city to find circles nearby"
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-9 text-sm text-text placeholder:text-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/30"
        />
        {(loading || q) && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-subtle" />
            ) : (
              <button type="button" onClick={() => setQ('')} aria-label="Clear search">
                <X className="h-4 w-4 text-subtle hover:text-text" />
              </button>
            )}
          </span>
        )}

        {open && results.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
            {results.map((r) => (
              <li key={r.label}>
                <button
                  type="button"
                  onClick={() => go(r.lat, r.lng, r.label)}
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

      {/* Action buttons — pinned right on the same baseline as the search field. */}
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm font-medium text-text transition-colors hover:border-primary hover:text-primary-strong disabled:opacity-60"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          Use my location
        </button>
        {trailing}
      </div>
    </div>

      {activePlace && (
        <div>
          <button
            type="button"
            onClick={clear}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-bg px-3 py-1.5 text-xs font-semibold text-primary-strong transition-colors hover:bg-primary-bg/70"
          >
            Near {activePlace}
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}
