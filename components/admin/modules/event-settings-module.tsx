'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ImagePlus } from 'lucide-react'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { RailSaveRow } from '@/components/admin/rail/rail-autosave-form'
import { useRailAutosave, isInstant, isTextLike } from '@/components/admin/rail/use-rail-autosave'
import { createClient } from '@/lib/supabase/client'
import {
  getEventAdminData,
  getEventEngageData,
  updateEventSettings,
  updateEventPermalink,
  removeEventPoster,
  setEventGalleryImages,
  uploadEventGalleryImage,
  type EventEngageData,
  // Aliased: it's a server action, not a React hook — the `use*` name would trip the
  // rules-of-hooks lint when called inside a callback.
  useEventPosterAsCover as promotePosterToCover,
} from '@/app/(main)/events/admin-actions'
import { MultiImageUpload } from '@/components/ui/multi-image-upload'
import { EventLoomPicker } from '@/components/admin/modules/event-loom-picker'
import { VenueAutocomplete } from '@/components/admin/venue-autocomplete'
import { EventHeroHeightControl } from '@/components/admin/modules/event-hero-height-control'
import { EventCoverFocusControl } from '@/components/admin/modules/event-cover-focus-control'
import { EventPlacementField } from '@/components/events/event-placement-field'
import { readEventHeroHeight } from '@/lib/events/hero-height'
import { readEventCoverFocus } from '@/lib/events/cover-focus'
import type { PlaceResult } from '@/lib/geocode'
import {
  CATEGORY_OPTIONS,
  VISIBILITY_OPTIONS,
  ENERGY_OPTIONS,
  ATTENDANCE_OPTIONS,
} from '@/lib/events/options'
import { isoToWallClockInput } from '@/lib/events/datetime'
import { COMMON_TIME_ZONES } from './event-shared-fields-module'

// In-place "Event settings" (EMBEDDED-ADMIN.md / ADR-133) on /events/[slug]. This is now the SINGLE
// host field editor for the event: the old Place & Time and Engage editor modules folded in here
// (Event page overhaul) so there is ONE top-to-bottom flow with no duplicated Address / Map / time
// boxes. The rail section header is the single title. Every field autosaves and reflects on the page
// live (useRailAutosave): text on blur, selects instantly. Programmatic changes (a venue pick that
// fills the hidden address inputs, a dragged map pin) call saveNow(). Images + hero height self-save
// through their own actions; the permalink keeps its own action (a rename redirects the page).
//
// Flow (top to bottom): Stats box (Sold | Revenue | Checked in) · Images · Title · Capacity · Ticket
// price · Description · Starts / Ends / Who / Format / What kind / Energy (+ time zone / repeats) ·
// RSVP window · Location (one live venue search + one map; the street/city/region/postal/country ride
// as hidden derived inputs) · Permalink · Placement.

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

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(
      cents / 100,
    )
  } catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}

/** A human one-line location string composed from a venue pick, so the public page's location line
 *  and the Maps deep link still have text even though the structured fields are hidden. */
function composeLocation(p: PlaceResult): string {
  const head = p.name ?? p.street
  const parts = [head, p.city, p.region].filter(Boolean) as string[]
  const seen = new Set<string>()
  const line = parts.filter((x) => (seen.has(x) ? false : (seen.add(x), true))).join(', ')
  return line || p.label
}

export function EventSettingsModule() {
  const pathname = usePathname()
  const router = useRouter()
  const slug = pathname.match(/^\/events\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<EventData | null>(null)
  const [engage, setEngage] = useState<EventEngageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [imgErr, setImgErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [permalink, setPermalink] = useState('')
  const [permaErr, setPermaErr] = useState<string | null>(null)
  const [permaPending, startPerma] = useTransition()
  const [mode, setMode] = useState('in_person')
  const [recurrence, setRecurrence] = useState('none')
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [galleryPaths, setGalleryPaths] = useState<string[]>([])
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [location, setLocation] = useState('')
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
  // Resolve an event-media gallery PATH to its public URL (the header preview for the focus control).
  // Declared with the other hooks (before any early return) so it runs unconditionally every render.
  const eventMediaUrl = useCallback(
    (path: string) => createClient().storage.from('event-media').getPublicUrl(path).data.publicUrl,
    [],
  )

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
            setRecurrence(d.recurrence_type ?? 'none')
            setPosterUrl(d.posterUrl ?? null)
            setGalleryPaths(d.galleryPaths ?? [])
            setCoverUrl(d.coverUrl ?? null)
            setLocation(d.location ?? '')
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
    // Stats (Sold | Revenue | Checked in) — its own read; failure just hides the box.
    getEventEngageData(slug)
      .then((e) => {
        if (active) setEngage(e)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [slug])

  if (!slug) return null
  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  // The venue autocomplete biases to the event's pin, else the viewer's home (local-first search).
  const bias = lat != null && lng != null ? { lat, lng } : (data.viewerHome ?? null)

  // A venue pick fills every hidden address field it has, sets the one-line location, drops the pin,
  // then commits.
  function handleVenuePick(p: PlaceResult) {
    setVenueName(p.name ?? p.label)
    if (p.street) setStreet(p.street)
    if (p.city) setCity(p.city)
    if (p.region) setRegion(p.region)
    if (p.postalCode) setPostalCode(p.postalCode)
    if (p.country) setCountry(p.country)
    setLat(p.lat)
    setLng(p.lng)
    setLocation(composeLocation(p))
    // Wait for the controlled inputs to flush the new values into the form before snapshotting.
    requestAnimationFrame(saveNow)
  }

  function handleUsePosterAsCover() {
    if (!data || pending) return
    startTransition(async () => {
      const res = await promotePosterToCover(data!.id, data!.slug)
      if ('url' in res) {
        // The poster is now the FIRST gallery tile (the header). Reflect both live.
        setCoverUrl(res.url)
        setGalleryPaths(res.paths)
      } else setImgErr(res.error)
    })
  }

  // A picked Loom image was copied into the gallery server-side; apply the returned order + header.
  function handleAddedFromLoom(paths: string[]) {
    setGalleryPaths(paths)
    setCoverUrl(paths[0] ? eventMediaUrl(paths[0]) : null)
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
    // The FIRST photo is the header/cover — keep the focus-control preview in sync with gallery[0].
    setCoverUrl(next[0] ? eventMediaUrl(next[0]) : null)
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

  // Prepend the event's own saved zone when it falls outside the curated list.
  const zone = data.time_zone ?? 'America/Los_Angeles'
  const zones = COMMON_TIME_ZONES.some((z) => z.value === zone)
    ? COMMON_TIME_ZONES
    : [{ value: zone, label: zone }, ...COMMON_TIME_ZONES]

  return (
    <div className="space-y-4">
      {/* STATS — Sold | Revenue | Checked in, pinned at the very top. */}
      {engage && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Sold', value: String(engage.ticketsSold) },
            { label: 'Revenue', value: formatMoney(engage.revenueCents, engage.currency) },
            { label: 'Checked in', value: `${engage.checkedIn}/${engage.going}` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
              <div className="truncate text-base font-bold text-text">{s.value}</div>
              <div className="text-2xs font-medium uppercase tracking-wide text-subtle">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* IMAGES — ONE ordered gallery leads the area: the FIRST photo IS the header. Then the
          "Select from Loom" picker, the scanned-poster shortcut, and the hero-height / focus controls. */}
      <div className="space-y-4">
        <div className="space-y-2">
          <span className={fieldLabel}>Photos</span>
          {/* One ordered gallery. The first tile is the header/cover; the rest follow in display order.
              Drag a photo, or use the arrows, to reorder — moving a photo to the front makes it the header. */}
          <MultiImageUpload
            label="Gallery photos"
            value={galleryPaths}
            onChange={handleGalleryChange}
            folder="event-gallery"
            hint="These show on the event page in this order. The first photo is the header. Drag a photo, or use the arrows, to reorder."
            disabled={pending}
            reorderable
            upload={uploadEventGalleryImage.bind(null, data.id, data.slug)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <EventLoomPicker
              eventId={data.id}
              slug={data.slug}
              disabled={pending}
              onAdded={handleAddedFromLoom}
            />
          </div>

          {/* Scanned-poster shortcut: when this event was captured from a poster and has no photos yet,
              one tap makes the original flyer the header. It becomes a normal reorderable tile after. */}
          {posterUrl && galleryPaths.length === 0 && (
            <div className="space-y-2 rounded-xl border border-border bg-surface-elevated/40 p-3">
              <div className="flex items-start gap-3">
                <div className="relative shrink-0 overflow-hidden rounded-xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={posterUrl} alt={data.title} className="h-24 w-24 object-cover" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-subtle">This event was captured from a scanned poster.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleUsePosterAsCover}
                      disabled={pending}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-50"
                    >
                      <ImagePlus className="h-3.5 w-3.5" /> Use it as the header photo
                    </button>
                    <button
                      type="button"
                      onClick={handleRemovePoster}
                      disabled={pending}
                      className="text-2xs font-medium text-subtle underline underline-offset-2 transition-colors hover:text-danger disabled:opacity-50"
                    >
                      Remove the scanned poster
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <EventHeroHeightControl
          eventId={data.id}
          slug={data.slug}
          initial={readEventHeroHeight(data.theme)}
        />
        {coverUrl && (
          <EventCoverFocusControl
            eventId={data.id}
            slug={data.slug}
            imageUrl={coverUrl}
            initial={readEventCoverFocus(data.theme)}
          />
        )}
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
        {/* TITLE + CAPACITY */}
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

        {/* TICKET PRICE — blank keeps the event a free RSVP. */}
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Ticket price</span>
          <span className="flex items-center rounded-lg border border-border bg-surface px-3 text-sm text-subtle">
            <span className="shrink-0 uppercase">{data.currency ?? 'usd'}</span>
            <input
              name="price"
              type="number"
              min={0}
              step="0.01"
              defaultValue={data.price_cents != null && data.price_cents > 0 ? (data.price_cents / 100).toString() : ''}
              placeholder="Free"
              className="min-w-0 flex-1 bg-transparent px-2 py-2 text-text outline-none"
            />
          </span>
          <span className="text-2xs text-subtle">Leave blank for a free RSVP event. Set a price to sell tickets.</span>
        </label>

        {/* DESCRIPTION */}
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Description</span>
          <textarea name="description" defaultValue={data.description ?? ''} rows={4} className={`${input} resize-none`} />
        </label>

        {/* WHEN + WHO — starts / ends / who can see. */}
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

        {/* FORMAT / WHAT KIND / ENERGY */}
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

        {/* TIME ZONE + REPEATS */}
        <div className="grid grid-cols-2 gap-2">
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
            <select name="recurrence_type" value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={`${input} min-w-0 px-2`}>
              {RECURRENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {recurrence !== 'none' && (
          <label className="block space-y-1.5">
            <span className={fieldLabel}>
              Repeat until <span className="font-normal text-subtle">(leave blank to repeat indefinitely)</span>
            </span>
            <input name="recurrence_until" type="date" defaultValue={isoToDateInput(data.recurrence_until)} className={`${input} px-2`} />
          </label>
        )}

        {/* Join link (online / hybrid only), toggled by Format. */}
        {mode !== 'in_person' && (
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Join link</span>
            <input name="online_url" type="url" defaultValue={data.online_url ?? ''} placeholder="https://…" className={input} />
          </label>
        )}

        {/* RSVP WINDOW — when people can RSVP. */}
        <div className="space-y-3 rounded-xl border border-border bg-surface-elevated/40 p-3">
          <span className={fieldLabel}>
            RSVP window <span className="font-normal text-subtle">(when people can RSVP)</span>
          </span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

        {/* LOCATION — ONE live venue search + ONE map (in person / hybrid). Picking a venue or dragging
            the pin sets the address; the street/city/region/postal/country ride as hidden derived
            inputs, so there is no duplicate address block. Kept inside the non-online guard so that
            switching to Online submits them empty → the stored address clears (as before). */}
        {mode !== 'online' && (
          <div className="space-y-3">
            <div className="space-y-1.5 rounded-xl border border-border bg-surface-elevated/40 p-3">
              <span className={fieldLabel}>
                Location <span className="font-normal text-subtle">(search a venue to set the address and drop the pin)</span>
              </span>
              <VenueAutocomplete value={venueName} onPick={handleVenuePick} bias={bias} />
            </div>
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
            </div>

            {/* Hidden derived location inputs — set by the venue pick / map pin, submitted with the form. */}
            <input type="hidden" name="location" value={location} />
            <input type="hidden" name="venue_name" value={venueName} />
            <input type="hidden" name="street" value={street} />
            <input type="hidden" name="city" value={city} />
            <input type="hidden" name="region" value={region} />
            <input type="hidden" name="postal_code" value={postalCode} />
            <input type="hidden" name="country" value={country} />
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

      {/* WHERE IT LIVES — placement under a Space or Circle (steward-approved). Its own actions. */}
      <EventPlacementField eventId={data.id} slug={data.slug} />
    </div>
  )
}
