'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Check } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { COMMON_TIME_ZONES } from './event-shared-fields-module'
import { getCirclePlaceTimeData, updateCirclePlaceTime } from '@/app/(main)/circles/admin-actions'

// In-place "Place & Time" module (ADMIN-RAIL.md Phase 7, the 'place' spine cell — the LP-EVENT
// recipe applied to circles). Renders inside the page admin dock on /circles/[slug] and renders
// nothing unless the server grants circle.editSettings. Owns where + when the circle meets: in
// person or online, the neighborhood/city, the map pin, and the time zone. The map pin reuses the
// same generic maplibre picker the event editor uses; the time-zone list is the shared curated set.

const input = fieldClasses
const fieldLabel = labelClasses

type PlaceTimeData = NonNullable<Awaited<ReturnType<typeof getCirclePlaceTimeData>>>

// maplibre must never run on the server, so the pin picker is client-only (same generic picker the
// event editor uses — it only reports a dragged lat/lng up).
const CircleLocationPicker = dynamic(() => import('@/components/events/event-location-picker'), {
  ssr: false,
  loading: () => (
    <div className="h-56 w-full animate-pulse rounded-xl border border-border bg-surface-elevated" />
  ),
})

export function CirclePlaceTimeModule() {
  const pathname = usePathname()
  const slug = pathname.match(/^\/circles\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<PlaceTimeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [type, setType] = useState<'in-person' | 'online'>('in-person')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)

  useEffect(() => {
    if (!slug) return
    let active = true
    getCirclePlaceTimeData(slug)
      .then((d) => {
        if (active) {
          setData(d)
          if (d) {
            setType(d.type)
            setLat(d.latitude)
            setLng(d.longitude)
          }
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

  const mod = moduleById('circle.placeAndTime')
  const Icon = mod?.Icon

  // The circle's own saved zone, prepended when it falls outside the curated list, so a rare zone is
  // never silently dropped on save.
  const zone = data.timezone ?? 'America/Los_Angeles'
  const zones = COMMON_TIME_ZONES.some((z) => z.value === zone)
    ? COMMON_TIME_ZONES
    : [{ value: zone, label: zone }, ...COMMON_TIME_ZONES]

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        await updateCirclePlaceTime(data!.id, data!.slug, fd)
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
          <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
            <label className="block min-w-0 space-y-1.5">
              <span className={fieldLabel}>How you meet</span>
              <select
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value === 'online' ? 'online' : 'in-person')}
                disabled={pending}
                className={`${input} min-w-0 px-2`}
              >
                <option value="in-person">In person</option>
                <option value="online">Online</option>
              </select>
            </label>
            <label className="block min-w-0 space-y-1.5">
              <span className={fieldLabel}>Time zone</span>
              <select name="timezone" defaultValue={zone} disabled={pending} className={`${input} min-w-0 px-2`}>
                {zones.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* WHERE — only for an in-person circle. Switching to online clears the meeting place. */}
          {type === 'in-person' && (
            <>
              <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
                <label className="block min-w-0 space-y-1.5">
                  <span className={fieldLabel}>Neighborhood</span>
                  <input
                    name="neighborhood"
                    defaultValue={data.neighborhood ?? ''}
                    disabled={pending}
                    className={`${input} min-w-0`}
                  />
                </label>
                <label className="block min-w-0 space-y-1.5">
                  <span className={fieldLabel}>City</span>
                  <input name="city" defaultValue={data.city ?? ''} disabled={pending} className={`${input} min-w-0`} />
                </label>
              </div>

              <div className="space-y-1.5">
                <span className={fieldLabel}>Pin where you meet</span>
                <CircleLocationPicker
                  lat={lat}
                  lng={lng}
                  onChange={(nLat, nLng) => {
                    setLat(nLat)
                    setLng(nLng)
                  }}
                />
                <p className="text-2xs text-subtle">
                  Drag the pin or tap the map to set the meeting spot. This is what the circle&apos;s map
                  shows.
                </p>
                <input type="hidden" name="lat" value={lat ?? ''} />
                <input type="hidden" name="lng" value={lng ?? ''} />
              </div>
            </>
          )}

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
