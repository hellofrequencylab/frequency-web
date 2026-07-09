'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { RailAutosaveForm, useRailSaveNow } from '@/components/admin/rail/rail-autosave-form'
import { COMMON_TIME_ZONES } from './event-shared-fields-module'
import { getCirclePlaceTimeData, updateCirclePlaceTime } from '@/app/(main)/circles/admin-actions'

// In-place "Place & Time" module (ADMIN-RAIL.md Phase 7, the 'place' spine cell). Renders on
// /circles/[slug] and renders nothing unless the server grants circle.editSettings. Owns where + when the
// circle meets. The rail supplies the title; every field autosaves and reflects live, and a dragged map
// pin commits via saveNow().

const input = fieldClasses
const fieldLabel = labelClasses

type PlaceTimeData = NonNullable<Awaited<ReturnType<typeof getCirclePlaceTimeData>>>

// maplibre must never run on the server, so the pin picker is client-only.
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

  // Prepend the circle's own saved zone when it falls outside the curated list, so a rare zone is never
  // silently dropped on save.
  const zone = data.timezone ?? 'America/Los_Angeles'
  const zones = COMMON_TIME_ZONES.some((z) => z.value === zone)
    ? COMMON_TIME_ZONES
    : [{ value: zone, label: zone }, ...COMMON_TIME_ZONES]

  return (
    <div className="@container">
      <RailAutosaveForm action={updateCirclePlaceTime.bind(null, data.id, data.slug)}>
        <PlaceTimeFields
          onType={setType}
          type={type}
          zone={zone}
          zones={zones}
          data={data}
          lat={lat}
          lng={lng}
          setLat={setLat}
          setLng={setLng}
        />
      </RailAutosaveForm>
    </div>
  )
}

/** The field body — a child of RailAutosaveForm so it can read `saveNow` from context and commit a
 *  dragged map pin (a programmatic change fires no native form event). */
function PlaceTimeFields({
  type,
  onType,
  zone,
  zones,
  data,
  lat,
  lng,
  setLat,
  setLng,
}: {
  type: 'in-person' | 'online'
  onType: (t: 'in-person' | 'online') => void
  zone: string
  zones: { value: string; label: string }[]
  data: PlaceTimeData
  lat: number | null
  lng: number | null
  setLat: (n: number | null) => void
  setLng: (n: number | null) => void
}) {
  const saveNow = useRailSaveNow()
  return (
    <>
      <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
        <label className="block min-w-0 space-y-1.5">
          <span className={fieldLabel}>How you meet</span>
          <select
            name="type"
            value={type}
            onChange={(e) => onType(e.target.value === 'online' ? 'online' : 'in-person')}
            className={`${input} min-w-0 px-2`}
          >
            <option value="in-person">In person</option>
            <option value="online">Online</option>
          </select>
        </label>
        <label className="block min-w-0 space-y-1.5">
          <span className={fieldLabel}>Time zone</span>
          <select name="timezone" defaultValue={zone} className={`${input} min-w-0 px-2`}>
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
              <input name="neighborhood" defaultValue={data.neighborhood ?? ''} className={`${input} min-w-0`} />
            </label>
            <label className="block min-w-0 space-y-1.5">
              <span className={fieldLabel}>City</span>
              <input name="city" defaultValue={data.city ?? ''} className={`${input} min-w-0`} />
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
                requestAnimationFrame(saveNow)
              }}
            />
            <p className="text-2xs text-subtle">
              Drag the pin or tap the map to set the meeting spot. This is what the circle&apos;s map shows.
            </p>
            <input type="hidden" name="lat" value={lat ?? ''} />
            <input type="hidden" name="lng" value={lng ?? ''} />
          </div>
        </>
      )}
    </>
  )
}
