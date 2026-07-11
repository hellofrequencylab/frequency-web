'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { X, ImagePlus } from 'lucide-react'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { InlineCover } from '@/components/admin/inline/inline-cover'
import { RailSaveRow } from '@/components/admin/rail/rail-autosave-form'
import { useRailAutosave, isInstant, isTextLike } from '@/components/admin/rail/use-rail-autosave'
import {
  getEventAdminData,
  updateEventSettings,
  updateEventPermalink,
  uploadEventCover,
  removeEventCover,
  removeEventPoster,
  setEventGalleryImages,
  uploadEventGalleryImage,
  // Aliased: it's a server action, not a React hook — the `use*` name would trip the
  // rules-of-hooks lint when called inside a callback.
  useEventPosterAsCover as promotePosterToCover,
} from '@/app/(main)/events/admin-actions'
import { MultiImageUpload } from '@/components/ui/multi-image-upload'
import { VenueAutocomplete } from '@/components/admin/venue-autocomplete'
import type { PlaceResult } from '@/lib/geocode'
import {
  CATEGORY_OPTIONS,
  VISIBILITY_OPTIONS,
  ENERGY_OPTIONS,
  ATTENDANCE_OPTIONS,
} from '@/lib/events/options'
import { isoToWallClockInput } from '@/lib/events/datetime'

// In-place "Event settings" (EMBEDDED-ADMIN.md / ADR-133) on /events/[slug]. The rail section header is
// the single title. Every field autosaves and reflects on the page live (useRailAutosave): text on blur,
// selects instantly. Programmatic changes (a venue pick that fills several fields, a dragged map pin) call
// saveNow(). Images self-save through their own actions; the permalink keeps its own action (a rename
// redirects the page). This removes the old Save button + the confusing "some fields auto-save, some don't".

// maplibre must never run on the server → dynamically imported, client-only.
const EventLocationPicker = dynamic(() => import('@/components/events/event-location-picker'), {
  ssr: false,
  loading: () => (
    <div className="h-56 w-full animate-pulse rounded-xl border border-border bg-surface-elevated" />
  ),
})

type EventData = NonNullable<Awaited<ReturnType<typeof getEventAdminData>>>

const input = fieldClasses
const fieldLabel = labelClasses

export function EventSettingsModule() {
  const pathname = usePathname()
  const router = useRouter()
  const slug = pathname.match(/^\/events\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [imgErr, setImgErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [permalink, setPermalink] = useState('')
  const [permaErr, setPermaErr] = useState<string | null>(null)
  const [permaPending, startPerma] = useTransition()
  const [mode, setMode] = useState('in_person')
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [galleryPaths, setGalleryPaths] = useState<string[]>([])
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [venueName, setVenueName] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)

  // The unified autosave engine + a form ref so a programmatic change (venue pick / map pin) can snapshot
  // the whole form and commit, since React setState on a controlled input fires no native change event.
  const eventId = data?.id
  const eventSlug = data?.slug
  const save = useRailAutosave(
    useCallback(
      (fd: FormData) => updateEventSettings(eventId!, eventSlug!, fd),
      [eventId, eventSlug],
    ),
  )
  const { commit } = save
  const formRef = useRef<HTMLFormElement>(null)
  const snapshot = useCallback(
    (immediate: boolean) => {
      const form = formRef.current
      if (form) commit(new FormData(form), immediate)
    },
    [commit],
  )
  const saveNow = useCallback(() => snapshot(true), [snapshot])

  useEffect(() => {
    if (!slug) return
    let active = true
    getEventAdminData(slug)
      .then((d) => {
        if (active) {
          setData(d)
          if (d) {
            setPermalink(d.slug)
            setMode(d.attendance_mode ?? 'in_person')
            setPosterUrl(d.posterUrl ?? null)
            setGalleryPaths(d.galleryPaths ?? [])
            setCoverUrl(d.coverUrl ?? null)
            setVenueName(d.venue_name ?? '')
            setStreet(d.street ?? '')
            setCity(d.city ?? '')
            setRegion(d.region ?? '')
            setPostalCode(d.postal_code ?? '')
            setCountry(d.country ?? '')
            setLat(d.lat ?? null)
            setLng(d.lng ?? null)
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

  // A venue pick fills every address field it has AND drops the pin, then commits.
  function handleVenuePick(p: PlaceResult) {
    setVenueName(p.name ?? p.label)
    if (p.street) setStreet(p.street)
    if (p.city) setCity(p.city)
    if (p.region) setRegion(p.region)
    if (p.postalCode) setPostalCode(p.postalCode)
    if (p.country) setCountry(p.country)
    setLat(p.lat)
    setLng(p.lng)
    // Wait for the controlled inputs to flush the new values into the form before snapshotting.
    requestAnimationFrame(saveNow)
  }

  function handleUsePosterAsCover() {
    if (!data || pending) return
    startTransition(async () => {
      const res = await promotePosterToCover(data!.id, data!.slug)
      if ('url' in res) setCoverUrl(res.url)
      else setImgErr(res.error)
    })
  }

  function handleRemovePoster() {
    if (!data || pending) return
    startTransition(async () => {
      try {
        await removeEventPoster(data!.id, data!.slug)
        setPosterUrl(null)
      } catch {
        /* best-effort; the thumbnail stays if it failed */
      }
    })
  }

  function handleGalleryChange(next: string[]) {
    setGalleryPaths(next)
    if (!data) return
    startTransition(async () => {
      await setEventGalleryImages(data!.id, data!.slug, next)
    })
  }

  function handlePermalink() {
    setPermaErr(null)
    startPerma(async () => {
      const res = await updateEventPermalink(data!.id, data!.slug, permalink)
      if ('error' in res) {
        setPermaErr(res.error)
      } else {
        router.push(`/events/${res.slug}`)
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* IMAGES — cover on top, gallery below. Each self-saves through its own action. */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <span className={fieldLabel}>Cover image</span>
          {coverUrl || !posterUrl ? (
            <InlineCover
              value={coverUrl}
              alt={data.title}
              canEdit
              forceEdit
              upload={uploadEventCover.bind(null, data.id, data.slug)}
              remove={removeEventCover.bind(null, data.id, data.slug)}
              onChange={setCoverUrl}
            />
          ) : (
            <div className="space-y-2">
              <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={posterUrl} alt={data.title} className="h-40 w-full object-cover sm:h-52" />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUsePosterAsCover}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-50"
                >
                  <ImagePlus className="h-3.5 w-3.5" /> Use the poster as the cover
                </button>
                <span className="text-2xs text-subtle">Or upload your own below once set.</span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <span className={fieldLabel}>Photos</span>
          {posterUrl && (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={posterUrl}
                alt="Original event poster"
                className="h-28 w-28 rounded-xl border border-border object-cover"
              />
              <button
                type="button"
                onClick={handleRemovePoster}
                disabled={pending}
                aria-label="Remove the original poster"
                className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-surface p-1 text-subtle shadow-sm transition-colors hover:text-danger disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <p className="mt-1 text-2xs text-subtle">The original poster</p>
            </div>
          )}
          <MultiImageUpload
            label="Gallery photos"
            value={galleryPaths}
            onChange={handleGalleryChange}
            folder="event-gallery"
            hint="Extra photos shown in the gallery on the event page. Add or remove anytime."
            disabled={pending}
            upload={uploadEventGalleryImage.bind(null, data.id, data.slug)}
          />
        </div>
        {imgErr && <p className="text-xs font-medium text-danger">{imgErr}</p>}
      </div>

      {/* The autosaving field form: text commits on blur, selects instantly. */}
      <form
        ref={formRef}
        onSubmit={(e) => e.preventDefault()}
        onBlur={(e) => {
          if (isTextLike(e.target)) snapshot(false)
        }}
        onChange={(e) => {
          if (isInstant(e.target)) snapshot(true)
        }}
        className="space-y-4"
      >
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Description</span>
          <textarea name="description" defaultValue={data.description ?? ''} rows={4} className={`${input} resize-none`} />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="col-span-2 block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Title</span>
            <input name="title" defaultValue={data.title} required className={`${input} min-w-0`} />
          </label>
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Capacity</span>
            <input name="capacity" type="number" min={1} defaultValue={data.capacity ?? ''} placeholder="Any" className={`${input} min-w-0`} />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className={fieldLabel}>Location</span>
          <input name="location" defaultValue={data.location ?? ''} className={input} />
        </label>

        <div className="grid grid-cols-3 gap-2">
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Starts</span>
            <input name="starts_at" type="datetime-local" defaultValue={isoToWallClockInput(data.starts_at)} required className={`${input} min-w-0 px-2`} />
          </label>
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Ends</span>
            <input name="ends_at" type="datetime-local" defaultValue={isoToWallClockInput(data.ends_at)} className={`${input} min-w-0 px-2`} />
          </label>
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Who can see this</span>
            <select name="visibility" defaultValue={data.visibility ?? 'circle_only'} className={`${input} min-w-0 px-2`}>
              {VISIBILITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Format</span>
            <select name="attendance_mode" value={mode} onChange={(e) => setMode(e.target.value)} className={`${input} min-w-0 px-2`}>
              {ATTENDANCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>What kind</span>
            <select name="category" defaultValue={data.category ?? 'gathering'} className={`${input} min-w-0 px-2`}>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Energy</span>
            <select name="energy_tag" defaultValue={data.energy_tag ?? ''} className={`${input} min-w-0 px-2`}>
              {ENERGY_OPTIONS.map((o) => (
                <option key={o.value || 'none'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Join link (online / hybrid only), toggled by Format. */}
        {mode !== 'in_person' && (
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Join link</span>
            <input name="online_url" type="url" defaultValue={data.online_url ?? ''} placeholder="https://…" className={input} />
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
              bias={lat != null && lng != null ? { lat, lng } : null}
            />
            <input type="hidden" name="venue_name" value={venueName} />
            <input name="street" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street address" className={input} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input name="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className={`${input} min-w-0`} />
              <input name="region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="State or province" className={`${input} min-w-0`} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input name="postal_code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Postal code" className={`${input} min-w-0`} />
              <input name="country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" className={`${input} min-w-0`} />
            </div>
          </div>
        )}

        {/* Map (in person / hybrid). The pin's lat/lng ride in hidden inputs; a drag commits via saveNow. */}
        {mode !== 'online' && (
          <div className="space-y-1.5">
            <span className={fieldLabel}>Pin the exact spot</span>
            <EventLocationPicker
              lat={lat}
              lng={lng}
              onChange={(nLat, nLng) => {
                setLat(nLat)
                setLng(nLng)
                requestAnimationFrame(saveNow)
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

        <div className="pt-1">
          <RailSaveRow state={save.state} error={save.error} />
        </div>
      </form>

      {/* Permalink — its own action: a rename redirects the page to the new URL. */}
      <div className="space-y-1.5">
        <span className={fieldLabel}>Permalink</span>
        <div className="flex items-center gap-2">
          <span className="flex flex-1 items-center rounded-lg border border-border bg-surface px-3 text-sm text-subtle">
            <span className="shrink-0">/events/</span>
            <input
              value={permalink}
              onChange={(e) => setPermalink(e.target.value)}
              disabled={permaPending}
              className="min-w-0 flex-1 bg-transparent py-2 text-text outline-none disabled:opacity-50"
            />
          </span>
          <button
            type="button"
            onClick={handlePermalink}
            disabled={permaPending || !permalink.trim() || permalink.trim() === data.slug}
            className="inline-flex shrink-0 items-center rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-40"
          >
            {permaPending ? 'Saving…' : 'Update'}
          </button>
        </div>
        {permaErr && <span className="text-xs font-medium text-danger">{permaErr}</span>}
      </div>
    </div>
  )
}
