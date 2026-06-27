'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Check, X, ImagePlus } from 'lucide-react'
import { moduleById } from '@/lib/admin/modules/registry'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import { InlineCover } from '@/components/admin/inline/inline-cover'
import {
  getEventAdminData,
  updateEventSettings,
  updateEventPermalink,
  uploadEventCover,
  removeEventCover,
  removeEventPoster,
  setEventGalleryImages,
  setEventCancelled,
  // Aliased: it's a server action, not a React hook — the `use*` name would trip the
  // rules-of-hooks lint when called inside a callback.
  useEventPosterAsCover as promotePosterToCover,
  deleteEvent,
} from '@/app/(main)/events/admin-actions'
import { DangerDelete } from '@/components/admin/danger-delete'
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

// In-place "Event settings" module (EMBEDDED-ADMIN.md / ADR-133). Renders inside
// the page admin dock on /events/[slug], and renders nothing unless the server
// grants event.editSettings (the event's host, staff, or whoever runs its circle).
// Mirrors the Circle settings module (flush, no card chrome; lg:grid 3-col).

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
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const [permalink, setPermalink] = useState('')
  const [permaErr, setPermaErr] = useState<string | null>(null)
  const [permaPending, startPerma] = useTransition()
  // Controlled so the join-link + address sections show for the right format.
  const [mode, setMode] = useState('in_person')
  // Photos manager: the original scanned poster (signed URL) + uploaded gallery paths.
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [galleryPaths, setGalleryPaths] = useState<string[]>([])
  // Cover preview the form tracks (so auto-promote / replace / remove reflect live).
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  // Live address inputs — controlled so a venue pick can fill them all at once.
  const [venueName, setVenueName] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState('')
  // Map pin lat/lng — seeded from the saved geog, moved by drag or a venue pick,
  // submitted as hidden inputs so the save persists a manual pin (overrides geocode).
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  // Two-step inline confirm for Cancel (Reinstate stays one tap).
  const [confirmingCancel, setConfirmingCancel] = useState(false)

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
        // A failed load shouldn't leave the dock spinning forever — drop the skeleton
        // (data stays null → the module renders nothing, same as not-permitted).
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

  const mod = moduleById('event.settings')
  const Icon = mod?.Icon

  // A venue pick fills every address field it has AND drops the pin. A field missing
  // from the result keeps its existing value (per §1).
  function handleVenuePick(p: PlaceResult) {
    setVenueName(p.name ?? p.label)
    if (p.street) setStreet(p.street)
    if (p.city) setCity(p.city)
    if (p.region) setRegion(p.region)
    if (p.postalCode) setPostalCode(p.postalCode)
    if (p.country) setCountry(p.country)
    setLat(p.lat)
    setLng(p.lng)
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        // updateEventSettings throws on an unauthorized/DB error or a bad time range —
        // catch it so the host sees why instead of a silent no-op + unhandled rejection.
        await updateEventSettings(data!.id, data!.slug, fd)
        setError(null)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save your changes. Try again.')
      }
    })
  }

  function handleUsePosterAsCover() {
    if (!data || pending) return
    startTransition(async () => {
      const res = await promotePosterToCover(data!.id, data!.slug)
      if ('url' in res) setCoverUrl(res.url)
      else setError(res.error)
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

  // No card chrome — the settings sit flush on the panel's white surface.
  return (
    <div className="space-y-6">
      <section>
        <header className="mb-4 space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-text">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-strong" />}
            {mod?.label ?? 'Event settings'}
          </h3>
          {mod?.desc && <p className="text-sm text-muted">{mod.desc}</p>}
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-x-6 lg:gap-y-4 lg:space-y-0">
          {/* IMAGES — full width, cover on top, gallery below (§2). */}
          <div className="space-y-4 lg:col-span-3">
            <div className="space-y-1.5">
              <span className={fieldLabel}>Cover image</span>
              {coverUrl || !posterUrl ? (
                // Normal cover editor — shows the cover (or the empty add-a-cover slot
                // when there's no poster to promote).
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
                // No cover yet, but a scanned poster exists → show it AS the cover with a
                // one-tap "Use as cover" that copies it into the public cover slot (§2).
                <div className="space-y-2">
                  <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated">
                    {/* Signed URL from the private poster bucket → plain img (outside the
                        next/image optimizer's allowed hosts). */}
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

            {/* Gallery — moved UNDER the cover (§2). The original scanned poster (removable)
                lives alongside, so a host can clear a duplicate/wrong scan. */}
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
              />
            </div>
          </div>

          {/* Description — full width, under the images (§3). */}
          <label className="block space-y-1.5 lg:col-span-3">
            <span className={fieldLabel}>Description</span>
            <textarea
              name="description"
              defaultValue={data.description ?? ''}
              rows={4}
              disabled={pending}
              className={`${input} resize-none`}
            />
          </label>

          {/* LEFT 2/3 — title, when, location, join link + address/map. */}
          <div className="space-y-4 lg:col-span-2">
            <label className="block space-y-1.5">
              <span className={fieldLabel}>Title</span>
              <input name="title" defaultValue={data.title} required disabled={pending} className={input} />
            </label>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Location</span>
              <input name="location" defaultValue={data.location ?? ''} disabled={pending} className={input} />
            </label>

            {/* Stacked on phones: two datetime-local inputs side by side exceed a
                phone-width panel (their intrinsic min-width can't shrink). */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block min-w-0 space-y-1.5">
                <span className={fieldLabel}>Starts</span>
                <input
                  name="starts_at"
                  type="datetime-local"
                  defaultValue={isoToWallClockInput(data.starts_at)}
                  required
                  disabled={pending}
                  className={`${input} min-w-0`}
                />
              </label>
              <label className="block min-w-0 space-y-1.5">
                <span className={fieldLabel}>Ends</span>
                <input
                  name="ends_at"
                  type="datetime-local"
                  defaultValue={isoToWallClockInput(data.ends_at)}
                  disabled={pending}
                  className={`${input} min-w-0`}
                />
              </label>
            </div>

            {/* Join link (online / hybrid) + structured address (in person / hybrid), toggled by Format. */}
            {mode !== 'in_person' && (
              <label className="block space-y-1.5">
                <span className={fieldLabel}>Join link</span>
                <input
                  name="online_url"
                  type="url"
                  defaultValue={data.online_url ?? ''}
                  placeholder="https://…"
                  disabled={pending}
                  className={input}
                />
              </label>
            )}

            {mode !== 'online' && (
              <div className="space-y-3 rounded-xl border border-border bg-surface-elevated/40 p-3">
                <span className={fieldLabel}>
                  Address <span className="font-normal text-subtle">(search a venue to fill it in and drop the pin)</span>
                </span>
                {/* Venue typeahead (§1): a pick fills every address field + moves the pin. */}
                <VenueAutocomplete value={venueName} onPick={handleVenuePick} disabled={pending} />
                <input type="hidden" name="venue_name" value={venueName} />
                <input
                  name="street"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Street address"
                  disabled={pending}
                  className={input}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    name="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    disabled={pending}
                    className={`${input} min-w-0`}
                  />
                  <input
                    name="region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="State or province"
                    disabled={pending}
                    className={`${input} min-w-0`}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    name="postal_code"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="Postal code"
                    disabled={pending}
                    className={`${input} min-w-0`}
                  />
                  <input
                    name="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Country"
                    disabled={pending}
                    className={`${input} min-w-0`}
                  />
                </div>

                {/* Draggable map pin (§5). The pin's lat/lng ride in hidden inputs so the
                    save persists a manual pin (which overrides the best-effort geocode). */}
                <div className="space-y-1.5">
                  <EventLocationPicker
                    lat={lat}
                    lng={lng}
                    onChange={(nLat, nLng) => {
                      setLat(nLat)
                      setLng(nLng)
                    }}
                  />
                  <p className="text-2xs text-subtle">
                    Drag the pin or tap the map to set the exact spot. This is the precise venue, not the
                    city-level area shown to people browsing.
                  </p>
                </div>
                <input type="hidden" name="lat" value={lat ?? ''} />
                <input type="hidden" name="lng" value={lng ?? ''} />
              </div>
            )}
          </div>

          {/* RIGHT 1/3 — format → kind → visibility → capacity → energy → permalink (§4). */}
          <div className="space-y-4 lg:col-span-1">
            <label className="block space-y-1.5">
              <span className={fieldLabel}>Format</span>
              <select
                name="attendance_mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                disabled={pending}
                className={input}
              >
                {ATTENDANCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>What kind of gathering</span>
              <select name="category" defaultValue={data.category ?? 'gathering'} disabled={pending} className={input}>
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Who can see this</span>
              <select name="visibility" defaultValue={data.visibility ?? 'circle_only'} disabled={pending} className={input}>
                {VISIBILITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Capacity</span>
              <input
                name="capacity"
                type="number"
                min={1}
                defaultValue={data.capacity ?? ''}
                placeholder="Unlimited"
                disabled={pending}
                className={input}
              />
            </label>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Energy</span>
              <select name="energy_tag" defaultValue={data.energy_tag ?? ''} disabled={pending} className={input}>
                {ENERGY_OPTIONS.map((o) => (
                  <option key={o.value || 'none'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Permalink — its own tiny action (not part of the content save) since a
                rename redirects the page to the new URL. */}
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

          {/* Error + save row — spans full width. */}
          <div className="space-y-3 pt-1 lg:col-span-3">
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

        {/* Cancel + Delete share ONE bordered box at the form bottom (§6). Cancel gets a
            two-step confirm; Reinstate stays one tap. Delete requires typing DELETE. */}
        <div className="mt-6 space-y-4 rounded-2xl border border-danger/30 bg-danger-bg/20 p-4">
          <div>
            <p className="text-sm font-semibold text-danger">
              {data.is_cancelled ? 'This event is cancelled' : 'Cancel this event'}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {data.is_cancelled
                ? 'It is off the calendar. Reinstate it to bring it back.'
                : 'Takes it off the calendar without losing it. RSVPs and check-ins stay intact.'}
            </p>
            {data.is_cancelled ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await setEventCancelled(data!.id, data!.slug, false)
                      setError(null)
                      setData((d) => (d ? { ...d, is_cancelled: false } : d))
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Could not update the event. Try again.')
                    }
                  })
                }
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-40"
              >
                Reinstate event
              </button>
            ) : !confirmingCancel ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmingCancel(true)}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-surface px-3 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-40"
              >
                Cancel event
              </button>
            ) : (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-danger">Cancel this event?</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await setEventCancelled(data!.id, data!.slug, true)
                        setError(null)
                        setData((d) => (d ? { ...d, is_cancelled: true } : d))
                        setConfirmingCancel(false)
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Could not update the event. Try again.')
                      }
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  Yes, cancel it
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(false)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text"
                >
                  Keep it
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-danger/20 pt-4">
            <DangerDelete
              entity="event"
              warning="Permanently removes the event and all its RSVPs and check-ins. To take it off the calendar without losing it, use Cancel instead."
              onDelete={() => deleteEvent(data!.id, data!.slug)}
              redirectTo="/events"
              confirmText="DELETE"
              chromeless
            />
          </div>
        </div>
      </section>
    </div>
  )
}
