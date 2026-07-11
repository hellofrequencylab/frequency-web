'use client'

import { useState } from 'react'
import { LocationAutocomplete } from '@/components/admin/location-autocomplete'
import { buttonClasses } from '@/components/ui/button'
import { saveSeekerProfileAction } from '../../actions'

// The seeker half (client) — captures budget, move-in, and the search LOCATION
// (city typeahead → lat/lng) plus a radius, which the consent-gated match RPC uses
// for coarse geo ranking. Coordinates are stored but never rendered back to anyone.

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const LABEL = 'mb-1 block text-sm font-medium text-text'

export interface SeekerFormValues {
  active: boolean
  budgetMin: string
  budgetMax: string
  moveIn: string
  city: string
  lat: number | null
  lng: number | null
  radiusMiles: number
}

export function SeekerForm({ initial }: { initial: SeekerFormValues }) {
  const [city, setCity] = useState(initial.city)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initial.lat != null && initial.lng != null ? { lat: initial.lat, lng: initial.lng } : null,
  )
  const [radius, setRadius] = useState(initial.radiusMiles)

  return (
    <form
      action={saveSeekerProfileAction}
      className="mb-8 space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="budget_min" className={LABEL}>
            Budget min (per month)
          </label>
          <input id="budget_min" name="budget_min" type="number" min="0" defaultValue={initial.budgetMin} className={FIELD} placeholder="e.g. 600" />
        </div>
        <div>
          <label htmlFor="budget_max" className={LABEL}>
            Budget max (per month)
          </label>
          <input id="budget_max" name="budget_max" type="number" min="0" defaultValue={initial.budgetMax} className={FIELD} placeholder="e.g. 1200" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <span className={LABEL}>Where do you want to live?</span>
          <LocationAutocomplete
            value={initial.city || null}
            placeholder="Search a city or town"
            onPick={(p) => {
              setCity(p.label)
              setCoords({ lat: p.lat, lng: p.lng })
            }}
          />
          {/* The picked place + its coordinates ride along as hidden fields. */}
          <input type="hidden" name="city" value={city} />
          <input type="hidden" name="search_lat" value={coords?.lat ?? ''} />
          <input type="hidden" name="search_lng" value={coords?.lng ?? ''} />
        </div>
        <div>
          <label htmlFor="move_in" className={LABEL}>
            Move-in from
          </label>
          <input id="move_in" name="move_in" type="date" defaultValue={initial.moveIn} className={FIELD} />
        </div>
      </div>

      <div>
        <label htmlFor="radius_miles" className={LABEL}>
          How far out? <span className="font-normal text-subtle">{radius} mi</span>
        </label>
        <input
          id="radius_miles"
          name="radius_miles"
          type="range"
          min="1"
          max="100"
          step="1"
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-full accent-primary"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-text">
        <input type="checkbox" name="active" defaultChecked={initial.active} className="h-4 w-4 rounded border-border" />
        Show me as actively looking
      </label>

      <div className="flex justify-end">
        <button type="submit" className={buttonClasses('primary', 'md')}>
          Save and refresh matches
        </button>
      </div>
    </form>
  )
}
