'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { useRailSaveNow } from '@/components/admin/rail/rail-autosave-form'
import { VenueAutocomplete } from '@/components/admin/venue-autocomplete'
import type { PlaceResult } from '@/lib/geocode'
import { ATTENDANCE_OPTIONS } from '@/lib/events/options'
import { isoToWallClockInput } from '@/lib/events/datetime'

// Shared when/where field clusters for the event admin modules. Extracted from the original
// event-settings-module so the Basics editor and the Place & Time editor render the SAME
// controls without copying them (PAGE-FRAMEWORK §8.5: reuse, don't duplicate). Each cluster is
// self-contained: it owns its controlled state, seeds from `initial`, and renders the same
// named inputs the server actions read from FormData, so a parent form just drops it in.

const input = fieldClasses
const fieldLabel = labelClasses

// maplibre must never run on the server, so the pin picker is client-only.
const EventLocationPicker = dynamic(() => import('@/components/events/event-location-picker'), {
  ssr: false,
  loading: () => (
    <div className="h-56 w-full animate-pulse rounded-xl border border-border bg-surface-elevated" />
  ),
})

/** The when cluster: start + end wall-clock inputs. Names: `starts_at`, `ends_at`. */
export function EventTimeFields({
  startsAt,
  endsAt,
  disabled,
}: {
  startsAt: string | null
  endsAt: string | null
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
      <label className="block min-w-0 space-y-1.5">
        <span className={fieldLabel}>Starts</span>
        <input
          name="starts_at"
          type="datetime-local"
          defaultValue={isoToWallClockInput(startsAt)}
          required
          disabled={disabled}
          className={`${input} min-w-0 px-2`}
        />
      </label>
      <label className="block min-w-0 space-y-1.5">
        <span className={fieldLabel}>Ends</span>
        <input
          name="ends_at"
          type="datetime-local"
          defaultValue={isoToWallClockInput(endsAt)}
          disabled={disabled}
          className={`${input} min-w-0 px-2`}
        />
      </label>
    </div>
  )
}

export interface EventLocationInitial {
  location: string | null
  attendance_mode: string | null
  online_url: string | null
  venue_name: string | null
  street: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  country: string | null
  lat: number | null
  lng: number | null
}

/** The where cluster: the one-line location, the format (in person / online / both), the join
 *  link (online / hybrid), the structured address a venue search fills, and the map pin. Names
 *  match the columns the server actions persist (`location`, `attendance_mode`, `online_url`,
 *  `venue_name`, `street`, `city`, `region`, `postal_code`, `country`, `lat`, `lng`). */
export function EventLocationFields({
  initial,
  disabled,
  onCommit,
}: {
  initial: EventLocationInitial
  disabled?: boolean
  /** Called after a programmatic change (venue pick / pin drag) so a parent autosave form can commit —
   *  React setState on a controlled input fires no native change event the form could catch on its own. */
  onCommit?: () => void
}) {
  const [mode, setMode] = useState(initial.attendance_mode ?? 'in_person')
  const [venueName, setVenueName] = useState(initial.venue_name ?? '')
  const [street, setStreet] = useState(initial.street ?? '')
  const [city, setCity] = useState(initial.city ?? '')
  const [region, setRegion] = useState(initial.region ?? '')
  const [postalCode, setPostalCode] = useState(initial.postal_code ?? '')
  const [country, setCountry] = useState(initial.country ?? '')
  const [lat, setLat] = useState<number | null>(initial.lat ?? null)
  const [lng, setLng] = useState<number | null>(initial.lng ?? null)
  // Inside a RailAutosaveForm the enclosing form commits on this; standalone it is a no-op. `onCommit`
  // (when passed) wins, so a non-rail host can still hook the programmatic changes.
  const ctxSaveNow = useRailSaveNow()
  const commit = onCommit ?? ctxSaveNow

  // A venue pick fills every address field it has AND drops the pin. A field missing from the
  // result keeps its current value.
  function handleVenuePick(p: PlaceResult) {
    setVenueName(p.name ?? p.label)
    if (p.street) setStreet(p.street)
    if (p.city) setCity(p.city)
    if (p.region) setRegion(p.region)
    if (p.postalCode) setPostalCode(p.postalCode)
    if (p.country) setCountry(p.country)
    setLat(p.lat)
    setLng(p.lng)
    requestAnimationFrame(commit)
  }

  return (
    <div className="space-y-4">
      {/* One-line location (full). */}
      <label className="block space-y-1.5">
        <span className={fieldLabel}>Location</span>
        <input name="location" defaultValue={initial.location ?? ''} disabled={disabled} className={input} />
      </label>

      {/* Format select — toggles the join link + address / map. */}
      <label className="block min-w-0 space-y-1.5">
        <span className={fieldLabel}>Format</span>
        <select
          name="attendance_mode"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          disabled={disabled}
          className={`${input} min-w-0 px-2`}
        >
          {ATTENDANCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {/* Join link (online / hybrid only). */}
      {mode !== 'in_person' && (
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Join link</span>
          <input
            name="online_url"
            type="url"
            defaultValue={initial.online_url ?? ''}
            placeholder="https://…"
            disabled={disabled}
            className={input}
          />
        </label>
      )}

      {/* Address box (in person / hybrid). A venue pick fills every field and drops the pin. */}
      {mode !== 'online' && (
        <div className="space-y-3 rounded-xl border border-border bg-surface-elevated/40 p-3">
          <span className={fieldLabel}>
            Address <span className="font-normal text-subtle">(search a venue to fill it in and drop the pin)</span>
          </span>
          <VenueAutocomplete
            value={venueName}
            onPick={handleVenuePick}
            disabled={disabled}
            bias={lat != null && lng != null ? { lat, lng } : null}
          />
          <input type="hidden" name="venue_name" value={venueName} />
          <input
            name="street"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            placeholder="Street address"
            disabled={disabled}
            className={input}
          />
          <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
            <input
              name="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              disabled={disabled}
              className={`${input} min-w-0`}
            />
            <input
              name="region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="State or province"
              disabled={disabled}
              className={`${input} min-w-0`}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
            <input
              name="postal_code"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="Postal code"
              disabled={disabled}
              className={`${input} min-w-0`}
            />
            <input
              name="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Country"
              disabled={disabled}
              className={`${input} min-w-0`}
            />
          </div>
        </div>
      )}

      {/* Map pin (in person / hybrid). The dragged marker's lat/lng ride in hidden inputs so the
          save persists a manual pin (overrides the best-effort geocode). */}
      {mode !== 'online' && (
        <div className="space-y-1.5">
          <span className={fieldLabel}>Pin the exact spot</span>
          <EventLocationPicker
            lat={lat}
            lng={lng}
            onChange={(nLat, nLng) => {
              setLat(nLat)
              setLng(nLng)
              requestAnimationFrame(commit)
            }}
          />
          <p className="text-2xs text-subtle">
            Drag the pin or tap the map to set the exact spot. This is the precise venue, not the
            city-level area shown to people browsing.
          </p>
          <input type="hidden" name="lat" value={lat ?? ''} />
          <input type="hidden" name="lng" value={lng ?? ''} />
        </div>
      )}
    </div>
  )
}

/** The curated IANA zones the Place & Time editor offers, HOME first. The event's own saved
 *  zone is prepended by the module when it falls outside this list, so no zone is ever lost. */
export const COMMON_TIME_ZONES: { value: string; label: string }[] = [
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Central Europe (Paris)' },
  { value: 'Europe/Athens', label: 'Eastern Europe (Athens)' },
  { value: 'Asia/Dubai', label: 'Gulf (Dubai)' },
  { value: 'Asia/Kolkata', label: 'India (Kolkata)' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Japan (Tokyo)' },
  { value: 'Australia/Sydney', label: 'Sydney' },
]
