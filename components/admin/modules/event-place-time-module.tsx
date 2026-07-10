'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { RailAutosaveForm } from '@/components/admin/rail/rail-autosave-form'
import {
  EventTimeFields,
  EventLocationFields,
  COMMON_TIME_ZONES,
} from './event-shared-fields-module'
import { getEventPlaceTimeData, updateEventPlaceTime } from '@/app/(main)/events/admin-actions'
import { isoToWallClockInput } from '@/lib/events/datetime'

// In-place "Place & Time" module (EMBEDDED-ADMIN.md / ADR-133; ENTITY-MANAGEMENT-OVERHAUL §4, the 'place'
// spine cell) on /events/[slug]. Owns when/where: start + end, timezone, recurrence, location + map pin,
// and the booking window. The rail supplies the title; every field autosaves and reflects live, and a
// venue pick / dragged pin commits via saveNow().

type PlaceTimeData = NonNullable<Awaited<ReturnType<typeof getEventPlaceTimeData>>>

const input = fieldClasses
const fieldLabel = labelClasses

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Repeats daily' },
  { value: 'weekly', label: 'Repeats weekly' },
  { value: 'monthly', label: 'Repeats monthly' },
]

/** A stored ISO instant → the `YYYY-MM-DD` a `<input type="date">` wants (UTC parts). */
function isoToDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function EventPlaceTimeModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/events\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<PlaceTimeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [recurrence, setRecurrence] = useState('none')

  useEffect(() => {
    if (!slug) return
    let active = true
    getEventPlaceTimeData(slug)
      .then((d) => {
        if (active) {
          setData(d)
          if (d) setRecurrence(d.recurrence_type ?? 'none')
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  // Prepend the event's own saved zone when it falls outside the curated list.
  const zone = data.time_zone ?? 'America/Los_Angeles'
  const zones = COMMON_TIME_ZONES.some((z) => z.value === zone)
    ? COMMON_TIME_ZONES
    : [{ value: zone, label: zone }, ...COMMON_TIME_ZONES]

  return (
    <div className="@container">
      <RailAutosaveForm action={updateEventPlaceTime.bind(null, data.id, data.slug)}>
        <>
            {/* WHEN — start + end, then timezone + recurrence. */}
            <EventTimeFields startsAt={data.starts_at} endsAt={data.ends_at} />

            <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
              <label className="block min-w-0 space-y-1.5">
                <span className={fieldLabel}>Time zone</span>
                <select name="time_zone" defaultValue={zone} className={`${input} min-w-0 px-2`}>
                  {zones.map((z) => (
                    <option key={z.value} value={z.value}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0 space-y-1.5">
                <span className={fieldLabel}>Repeats</span>
                <select
                  name="recurrence_type"
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value)}
                  className={`${input} min-w-0 px-2`}
                >
                  {RECURRENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Series end — only meaningful for a repeating event. */}
            {recurrence !== 'none' && (
              <label className="block space-y-1.5">
                <span className={fieldLabel}>
                  Repeat until <span className="font-normal text-subtle">(leave blank to repeat indefinitely)</span>
                </span>
                <input name="recurrence_until" type="date" defaultValue={isoToDateInput(data.recurrence_until)} className={`${input} px-2`} />
              </label>
            )}

            {/* WHERE — the shared location cluster. saveNow commits a venue pick / dragged pin. */}
            <EventLocationFields
              initial={{
                location: data.location,
                attendance_mode: data.attendance_mode,
                online_url: data.online_url,
                venue_name: data.venue_name,
                street: data.street,
                city: data.city,
                region: data.region,
                postal_code: data.postal_code,
                country: data.country,
                lat: data.lat,
                lng: data.lng,
              }}
            />

            {/* BOOKING WINDOW — when RSVPs open and close. */}
            <div className="space-y-3 rounded-xl border border-border bg-surface-elevated/40 p-3">
              <span className={fieldLabel}>
                Booking window <span className="font-normal text-subtle">(when people can RSVP)</span>
              </span>
              <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
                <label className="block min-w-0 space-y-1.5">
                  <span className={fieldLabel}>RSVPs open</span>
                  <input name="rsvp_opens_at" type="datetime-local" defaultValue={isoToWallClockInput(data.rsvpOpensAt)} className={`${input} min-w-0 px-2`} />
                </label>
                <label className="block min-w-0 space-y-1.5">
                  <span className={fieldLabel}>RSVPs close</span>
                  <input name="rsvp_closes_at" type="datetime-local" defaultValue={isoToWallClockInput(data.rsvpClosesAt)} className={`${input} min-w-0 px-2`} />
                </label>
              </div>
            </div>
        </>
      </RailAutosaveForm>
    </div>
  )
}
