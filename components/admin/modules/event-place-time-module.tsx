'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import {
  EventTimeFields,
  EventLocationFields,
  COMMON_TIME_ZONES,
} from './event-shared-fields-module'
import { getEventPlaceTimeData, updateEventPlaceTime } from '@/app/(main)/events/admin-actions'
import { isoToWallClockInput } from '@/lib/events/datetime'

// In-place "Place & Time" module (EMBEDDED-ADMIN.md / ADR-133; ENTITY-MANAGEMENT-OVERHAUL §4,
// the 'place' spine cell). Renders inside the page admin dock on /events/[slug] and renders
// nothing unless the server grants event.editSettings. Owns when/where: start + end, timezone,
// recurrence, location + map pin, and the booking window (when RSVPs open and close). Reuses the
// shared field clusters (event-shared-fields-module) so the controls match the Basics editor.

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
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
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

  const mod = moduleById('event.placeAndTime')
  const Icon = mod?.Icon

  // The event's own saved zone, prepended to the picker when it falls outside the curated list,
  // so a zone set from coordinates (e.g. a rare city) is never silently dropped on save.
  const zone = data.time_zone ?? 'America/Los_Angeles'
  const zones = COMMON_TIME_ZONES.some((z) => z.value === zone)
    ? COMMON_TIME_ZONES
    : [{ value: zone, label: zone }, ...COMMON_TIME_ZONES]

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await updateEventPlaceTime(data!.id, data!.slug, fd)
        setError(null)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save your changes. Try again.')
      }
    })
  }

  return (
    <div className="@container space-y-6">
      <section>
        <header className="mb-4 space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-text">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" />}
            {mod?.label ?? 'Place & Time'}
          </h3>
          {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* WHEN — start + end, then timezone + recurrence. */}
          <EventTimeFields startsAt={data.starts_at} endsAt={data.ends_at} disabled={pending} />

          <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
            <label className="block min-w-0 space-y-1.5">
              <span className={fieldLabel}>Time zone</span>
              <select
                name="time_zone"
                defaultValue={zone}
                disabled={pending}
                className={`${input} min-w-0 px-2`}
              >
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
                disabled={pending}
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
              <input
                name="recurrence_until"
                type="date"
                defaultValue={isoToDateInput(data.recurrence_until)}
                disabled={pending}
                className={`${input} px-2`}
              />
            </label>
          )}

          {/* WHERE — the shared location cluster (location, format, join link, address, map). */}
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
            disabled={pending}
          />

          {/* BOOKING WINDOW — when RSVPs open and close. Blank = open as soon as the event is
              published, and stays open until it starts. */}
          <div className="space-y-3 rounded-xl border border-border bg-surface-elevated/40 p-3">
            <span className={fieldLabel}>
              Booking window <span className="font-normal text-subtle">(when people can RSVP)</span>
            </span>
            <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
              <label className="block min-w-0 space-y-1.5">
                <span className={fieldLabel}>RSVPs open</span>
                <input
                  name="rsvp_opens_at"
                  type="datetime-local"
                  defaultValue={isoToWallClockInput(data.rsvpOpensAt)}
                  disabled={pending}
                  className={`${input} min-w-0 px-2`}
                />
              </label>
              <label className="block min-w-0 space-y-1.5">
                <span className={fieldLabel}>RSVPs close</span>
                <input
                  name="rsvp_closes_at"
                  type="datetime-local"
                  defaultValue={isoToWallClockInput(data.rsvpClosesAt)}
                  disabled={pending}
                  className={`${input} min-w-0 px-2`}
                />
              </label>
            </div>
          </div>

          {/* Error + save row. */}
          <div className="space-y-3 pt-1">
            {error && <p className="text-xs font-medium text-danger">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              {saved && (
                <span className="flex items-center gap-1 text-xs font-medium text-primary-strong">
                  <Check className="h-3.5 w-3.5" /> Saved
                </span>
              )}
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
              >
                {pending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}
