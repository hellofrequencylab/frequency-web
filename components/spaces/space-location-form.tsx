'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Check, Loader2, MapPin, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { Input, Label } from '@/components/ui/field'
import { FormError } from '@/components/spaces/space-form'
import { isError } from '@/lib/action-result'
import { searchVenues, type PlaceResult } from '@/lib/geocode'
import { setSpaceLocation } from '@/app/(main)/spaces/[slug]/manage/layout/actions'
import {
  EMPTY_SPACE_LOCATION,
  isMappable,
  type SpaceLocation,
  type SpaceLocationPrecision,
} from '@/lib/spaces/location'

// WHERE THIS SPACE IS (ADR-1026). The operator surface for the columns
// 20270301000000_space_location.sql added, and the reason the Around You map's Spaces layer can draw
// anything at all: before this, `spaces` held no coordinate of any kind, so all 20 active Spaces were
// unmappable while the map's empty state promised them.
//
// THREE WAYS IN, because operators arrive with different things in hand:
//   1. SEARCH an address or a venue name, and the pick fills every field and drops the pin. This is
//      the same server-side Nominatim cascade the event editor uses (/api/geocode/venues), which
//      honours a hard local viewbox, so "Royal Temple" finds the one in Vista and not one in France.
//   2. TYPE the address by hand, for a place no geocoder knows.
//   3. DRAG THE PIN, which the owner asked for by name. It composes the SAME picker the event editor
//      uses (components/events/event-location-picker.tsx), which composes the map seam, so this form
//      contains no map library and gets Google-or-MapLibre for free.
//
// ── 🔴 THE PRECISION CONTROL, WHICH IS THE POINT OF THE WHOLE FORM ────────────────────────────────
//
// A Space is not always a storefront. Plenty are run out of somebody's living room, and publishing a
// home address to a public map because the owner wanted to be findable would be the worst thing this
// feature could do. So the owner chooses, and the choice is described in terms of what a member will
// SEE rather than in terms of a stored enum: "your pin, exactly where you put it" versus "a circle
// about a kilometre across".
//
// The coarsening itself never happens here. This form always shows and always saves the TRUE point,
// so dragging a pin means what it says and re-opening the form does not walk the pin further away
// each time. lib/nearby/map-pins.ts coarsens once, on the read that publishes it.
//
// Dynamically imported with ssr:false, like every other caller of the picker: no map engine may run
// on the server (docs/DEPLOY-SAFETY.md §1 — map libraries are the heaviest thing the seam can reach).
const LocationPicker = dynamic(() => import('@/components/events/event-location-picker'), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-card bg-surface-elevated" />,
})

const PRECISION_OPTIONS: readonly {
  value: SpaceLocationPrecision
  label: string
  blurb: string
}[] = [
  {
    value: 'exact',
    label: 'Show my exact spot',
    blurb: 'Members see the pin exactly where you put it. Right for a shop, a studio, or any door you want people to walk through.',
  },
  {
    value: 'approximate',
    label: 'Show my general area',
    blurb: 'Members see an area about a kilometre across instead of your address. Right for a Space you run out of your home.',
  },
]

export function SpaceLocationForm({
  slug,
  initial,
  readOnly = false,
}: {
  slug: string
  initial: SpaceLocation
  readOnly?: boolean
}) {
  const router = useRouter()
  const [loc, setLoc] = useState<SpaceLocation>(initial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // ── The address typeahead ───────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const q = query.trim()
    // Every path goes through the timer, INCLUDING the "too short to search" one. Clearing the list
    // synchronously in the effect body is the obvious way to write this and it is a cascading render
    // (react-hooks/set-state-in-effect); doing it inside the timer costs one debounce of stale rows
    // on the screen and no correctness.
    //
    // The request is also ABORTED before a new one starts: without that a fast typist gets the answer
    // to a PREFIX of what they typed, which reads as the search being broken rather than late.
    const timer = setTimeout(() => {
      abortRef.current?.abort()
      if (q.length < 3) {
        setResults([])
        setSearching(false)
        return
      }
      const controller = new AbortController()
      abortRef.current = controller
      setSearching(true)
      // Bias to the pin the Space already has, so an operator refining an address gets the local
      // street rather than a same-named one on another continent.
      const bias = loc.latitude != null && loc.longitude != null
        ? { lat: loc.latitude, lng: loc.longitude }
        : null
      searchVenues(q, controller.signal, bias)
        .then((r) => setResults(r))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(timer)
    // `loc` coordinates only bias the search; re-running on every keystroke of an address field
    // would be noise, so the effect deliberately keys on the query alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => () => abortRef.current?.abort(), [])

  function applyPlace(place: PlaceResult) {
    setLoc((prev) => ({
      ...prev,
      street: place.street ?? prev.street,
      city: place.city ?? prev.city,
      region: place.region ?? prev.region,
      postalCode: place.postalCode ?? prev.postalCode,
      country: place.country ?? prev.country,
      latitude: place.lat,
      longitude: place.lng,
    }))
    setQuery('')
    setResults([])
    setSaved(false)
  }

  function field<K extends keyof SpaceLocation>(key: K, value: SpaceLocation[K]) {
    setLoc((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await setSpaceLocation(slug, loc)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  function clearPin() {
    setLoc((prev) => ({ ...prev, latitude: null, longitude: null }))
    setSaved(false)
  }

  const placed = isMappable(loc)
  const disabled = readOnly || pending

  return (
    <section aria-labelledby="space-location-heading" className="mt-8">
      <SectionHeader id="space-location-heading" title="Where you are" />
      <p className="mb-3 text-body-sm text-muted">
        Your address, and how precisely it shows on the community map. Leave the pin off and your
        Space stays off the map.
      </p>

      <div className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        {/* ── Find it ─────────────────────────────────────────────────────── */}
        <div className="relative">
          <Label htmlFor="space-location-search">Search for your address or venue</Label>
          <div className="relative mt-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input
              id="space-location-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Start typing an address"
              className="pl-9"
              disabled={disabled}
              autoComplete="off"
            />
            {searching && (
              <Loader2 aria-hidden className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-subtle" />
            )}
          </div>
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-card border border-border bg-surface shadow-lg">
              {results.map((place, i) => (
                <li key={`${place.label}-${i}`}>
                  <button
                    type="button"
                    onClick={() => applyPlace(place)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-body-sm transition-colors hover:bg-surface-elevated"
                  >
                    <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
                    <span className="min-w-0">
                      {place.name && <span className="block font-semibold text-text">{place.name}</span>}
                      <span className="block text-muted">{place.label}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Or type it ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="space-street">Street</Label>
            <Input id="space-street" className="mt-1" value={loc.street ?? ''} disabled={disabled}
              onChange={(e) => field('street', e.target.value || null)} />
          </div>
          <div>
            <Label htmlFor="space-city">City</Label>
            <Input id="space-city" className="mt-1" value={loc.city ?? ''} disabled={disabled}
              onChange={(e) => field('city', e.target.value || null)} />
          </div>
          <div>
            <Label htmlFor="space-region">State or region</Label>
            <Input id="space-region" className="mt-1" value={loc.region ?? ''} disabled={disabled}
              onChange={(e) => field('region', e.target.value || null)} />
          </div>
          <div>
            <Label htmlFor="space-postal">Postal code</Label>
            <Input id="space-postal" className="mt-1" value={loc.postalCode ?? ''} disabled={disabled}
              onChange={(e) => field('postalCode', e.target.value || null)} />
          </div>
          <div>
            <Label htmlFor="space-country">Country</Label>
            <Input id="space-country" className="mt-1" value={loc.country ?? ''} disabled={disabled}
              onChange={(e) => field('country', e.target.value || null)} />
          </div>
        </div>

        {/* ── The pin ─────────────────────────────────────────────────────── */}
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-body-sm font-semibold text-text">Your pin</span>
            {placed && !readOnly && (
              <button
                type="button"
                onClick={clearPin}
                className="inline-flex items-center gap-1 text-meta text-muted transition-colors hover:text-text"
              >
                <X aria-hidden className="h-3 w-3" />
                Take my Space off the map
              </button>
            )}
          </div>
          <p className="mb-2 text-body-sm text-muted">
            {placed
              ? 'Drag the pin to move it. This is the spot the map works from.'
              : 'Search above, or tap the map to drop a pin. Without a pin your Space stays off the map.'}
          </p>
          <LocationPicker
            lat={loc.latitude}
            lng={loc.longitude}
            onChange={(lat, lng) => {
              setLoc((prev) => ({ ...prev, latitude: lat, longitude: lng }))
              setSaved(false)
            }}
          />
        </div>

        {/* ── 🔴 How precisely it publishes ───────────────────────────────── */}
        <fieldset disabled={disabled}>
          <legend className="text-body-sm font-semibold text-text">How precisely should this show?</legend>
          <p className="mb-2 mt-0.5 text-body-sm text-muted">
            This only changes what other people see. Your own pin stays exactly where you put it.
          </p>
          <div className="space-y-2">
            {PRECISION_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors ${
                  loc.precision === option.value
                    ? 'border-primary bg-primary-bg/40 dark:bg-primary-bg/15'
                    : 'border-border hover:bg-surface-elevated'
                }`}
              >
                <input
                  type="radio"
                  name="space-location-precision"
                  value={option.value}
                  checked={loc.precision === option.value}
                  onChange={() => field('precision', option.value)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-body-sm font-semibold text-text">{option.label}</span>
                  <span className="block text-body-sm text-muted">{option.blurb}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && <FormError message={error} />}

        {!readOnly && (
          <div className="flex items-center gap-3">
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
              Save location
            </Button>
            {saved && !pending && (
              <span className="inline-flex items-center gap-1 text-body-sm text-muted">
                <Check aria-hidden className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export { EMPTY_SPACE_LOCATION }
