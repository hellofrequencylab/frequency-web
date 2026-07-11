'use client'

import { useState } from 'react'
import { LocationAutocomplete } from '@/components/admin/location-autocomplete'
import { buttonClasses } from '@/components/ui/button'
import { saveSeekerProfileAction } from '../../actions'

// The seeker half (client) — captures budget, move-in, the search LOCATION (city
// typeahead → lat/lng) plus a radius, AND the lifestyle preferences the resonance
// match blends. Coordinates are stored but never rendered back to anyone.
//
// Fair-Housing note: gender_pref is offered ONLY when the member is looking to SHARE a
// living space (the roommate exemption to the Fair Housing Act covers sex/gender for a
// shared home). Age is captured as a SOFT hint for ranking, never advertised as a hard
// "must be X" requirement. See the honest note rendered below the fields.

const FIELD =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'
const LABEL = 'mb-1 block text-sm font-medium text-text'

export interface LifestylePrefs {
  cleanliness: string
  socialLevel: string
  schedule: string
  diet: string
  pets: string
  smoking: string
  cannabis: string
  arrangement: string
  genderPref: string
  ageMin: string
  ageMax: string
}

export interface SeekerFormValues {
  active: boolean
  budgetMin: string
  budgetMax: string
  moveIn: string
  city: string
  lat: number | null
  lng: number | null
  radiusMiles: number
  /** Prefill for the lifestyle block. Optional so callers that don't yet read the
   *  preferences jsonb still compile; the form falls back to empty defaults. */
  lifestyle?: Partial<LifestylePrefs>
}

const EMPTY_LIFESTYLE: LifestylePrefs = {
  cleanliness: '',
  socialLevel: '',
  schedule: '',
  diet: '',
  pets: '',
  smoking: '',
  cannabis: '',
  arrangement: '',
  genderPref: '',
  ageMin: '',
  ageMax: '',
}

const SOCIAL_LEVELS = [
  { value: '', label: 'No preference' },
  { value: 'homebody', label: 'Homebody' },
  { value: 'balanced', label: 'A bit of both' },
  { value: 'social', label: 'Social, host often' },
]
const SCHEDULES = [
  { value: '', label: 'No preference' },
  { value: 'early_bird', label: 'Early bird' },
  { value: 'night_owl', label: 'Night owl' },
  { value: 'flexible', label: 'Flexible' },
]
const DIETS = [
  { value: '', label: 'No preference' },
  { value: 'omnivore', label: 'Omnivore' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'halal', label: 'Halal' },
  { value: 'kosher', label: 'Kosher' },
]
const PETS = [
  { value: '', label: 'No preference' },
  { value: 'have_pets', label: 'I have pets' },
  { value: 'ok_with_pets', label: 'Fine with pets' },
  { value: 'no_pets', label: 'Prefer no pets' },
]
const HOUSE_RULE = [
  { value: '', label: 'No preference' },
  { value: 'yes', label: 'Fine with it' },
  { value: 'outside_only', label: 'Outside only' },
  { value: 'no', label: 'Prefer none' },
]
const GENDER_PREF = [
  { value: '', label: 'No preference' },
  { value: 'women', label: 'Women' },
  { value: 'men', label: 'Men' },
  { value: 'nonbinary', label: 'Nonbinary' },
  { value: 'same_as_me', label: 'Same as me' },
]

function Select({
  id,
  label,
  options,
  defaultValue,
}: {
  id: string
  label: string
  options: { value: string; label: string }[]
  defaultValue: string
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select id={id} name={id} defaultValue={defaultValue} className={FIELD}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function SeekerForm({ initial }: { initial: SeekerFormValues }) {
  const ls: LifestylePrefs = { ...EMPTY_LIFESTYLE, ...(initial.lifestyle ?? {}) }
  const [city, setCity] = useState(initial.city)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initial.lat != null && initial.lng != null ? { lat: initial.lat, lng: initial.lng } : null,
  )
  const [radius, setRadius] = useState(initial.radiusMiles)
  // Gender preference is only lawful (and only shown) when the member is sharing a living
  // space. Track the arrangement so the field appears / disappears with it.
  const [arrangement, setArrangement] = useState(ls.arrangement || 'shared')
  const isSharedLiving = arrangement === 'shared'

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

      {/* ── Lifestyle: what the match blends on, beyond resonance + budget + geo ── */}
      <div className="space-y-4 border-t border-border pt-5">
        <div>
          <label htmlFor="arrangement" className={LABEL}>
            What are you after?
          </label>
          <select
            id="arrangement"
            name="arrangement"
            value={arrangement}
            onChange={(e) => setArrangement(e.target.value)}
            className={FIELD}
          >
            <option value="shared">A room in a shared home (roommates)</option>
            <option value="private">A whole place to myself</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cleanliness" className={LABEL}>
              Tidiness <span className="font-normal text-subtle">{ls.cleanliness || '3'} / 5</span>
            </label>
            <input
              id="cleanliness"
              name="cleanliness"
              type="range"
              min="1"
              max="5"
              step="1"
              defaultValue={ls.cleanliness || '3'}
              className="w-full accent-primary"
            />
          </div>
          <Select id="social_level" label="Social energy at home" options={SOCIAL_LEVELS} defaultValue={ls.socialLevel} />
          <Select id="schedule" label="Daily rhythm" options={SCHEDULES} defaultValue={ls.schedule} />
          <Select id="diet" label="Diet" options={DIETS} defaultValue={ls.diet} />
          <Select id="pets" label="Pets" options={PETS} defaultValue={ls.pets} />
          <Select id="smoking" label="Smoking" options={HOUSE_RULE} defaultValue={ls.smoking} />
          <Select id="cannabis" label="Cannabis" options={HOUSE_RULE} defaultValue={ls.cannabis} />
        </div>

        {isSharedLiving && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select id="gender_pref" label="Roommate gender" options={GENDER_PREF} defaultValue={ls.genderPref} />
            <div>
              <label htmlFor="age_min" className={LABEL}>
                Ideal age from
              </label>
              <input id="age_min" name="age_min" type="number" min="18" max="120" defaultValue={ls.ageMin} className={FIELD} placeholder="Any" />
            </div>
            <div>
              <label htmlFor="age_max" className={LABEL}>
                Ideal age to
              </label>
              <input id="age_max" name="age_max" type="number" min="18" max="120" defaultValue={ls.ageMax} className={FIELD} placeholder="Any" />
            </div>
          </div>
        )}

        <p className="rounded-lg bg-surface-elevated p-3 text-xs text-subtle">
          Straight talk on roommate matching: tidiness, rhythm, and house rules help us rank who
          you would actually get along with, and they stay private to you. Gender preference is only
          offered when you are sharing a living space, and age is a soft hint for ranking, never a
          hard requirement we advertise. We never filter anyone out on protected traits.
        </p>
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
