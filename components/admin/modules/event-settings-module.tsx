'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
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
} from '@/app/(main)/events/admin-actions'
import { MultiImageUpload } from '@/components/ui/multi-image-upload'
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

        <form onSubmit={handleSubmit} className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0">
          {/* LEFT 2/3 — cover, title, description. */}
          <div className="space-y-4 lg:col-span-2">
            {/* Cover image — edited here in Settings (no inline editing on the page). */}
            <div className="space-y-1.5">
              <span className={fieldLabel}>Cover image</span>
              <InlineCover
                value={data.coverUrl ?? null}
                alt={data.title}
                canEdit
                forceEdit
                upload={uploadEventCover.bind(null, data.id, data.slug)}
                remove={removeEventCover.bind(null, data.id, data.slug)}
              />
            </div>

            {/* Photos — the original scanned poster (removable) + extra gallery images
                (add / remove). Lets a host clear a poster that scanned in duplicated or
                wrong, and curate the gallery shown on the event page. */}
            <div className="space-y-2">
              <span className={fieldLabel}>Photos</span>
              {posterUrl && (
                <div className="relative inline-block">
                  {/* Signed URL from the private poster bucket → plain img (outside the
                      next/image optimizer's allowed hosts), same as the recap album. */}
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

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Title</span>
              <input name="title" defaultValue={data.title} required disabled={pending} className={input} />
            </label>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Description</span>
              <textarea
                name="description"
                defaultValue={data.description ?? ''}
                rows={3}
                disabled={pending}
                className={`${input} resize-none`}
              />
            </label>

            <label className="block space-y-1.5">
              <span className={fieldLabel}>Location</span>
              <input name="location" defaultValue={data.location ?? ''} disabled={pending} className={input} />
            </label>

            {/* Stacked on phones: two datetime-local inputs side by side exceed a
                phone-width panel (their intrinsic min-width can't shrink), which
                forced the whole Settings panel to overflow sideways. */}
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
                  Address <span className="font-normal text-subtle">(optional, for the map)</span>
                </span>
                <input name="venue_name" defaultValue={data.venue_name ?? ''} placeholder="Venue name" disabled={pending} className={input} />
                <input name="street" defaultValue={data.street ?? ''} placeholder="Street address" disabled={pending} className={input} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input name="city" defaultValue={data.city ?? ''} placeholder="City" disabled={pending} className={`${input} min-w-0`} />
                  <input name="region" defaultValue={data.region ?? ''} placeholder="State or province" disabled={pending} className={`${input} min-w-0`} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input name="postal_code" defaultValue={data.postal_code ?? ''} placeholder="Postal code" disabled={pending} className={`${input} min-w-0`} />
                  <input name="country" defaultValue={data.country ?? ''} placeholder="Country" disabled={pending} className={`${input} min-w-0`} />
                </div>
              </div>
            )}
          </div>

          {/* RIGHT 1/3 — format, category, visibility, energy, capacity, permalink. */}
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
              <span className={fieldLabel}>Energy</span>
              <select name="energy_tag" defaultValue={data.energy_tag ?? ''} disabled={pending} className={input}>
                {ENERGY_OPTIONS.map((o) => (
                  <option key={o.value || 'none'} value={o.value}>
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

          {/* Error + actions row — spans full width at the bottom. */}
          <div className="space-y-3 pt-1 lg:col-span-3">
            {error && <p className="text-xs font-medium text-danger">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              {/* Cancel / reinstate — moved here from the header kebab so Settings is
                  the one host surface. Same server-side capability gate. */}
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await setEventCancelled(data!.id, data!.slug, !data!.is_cancelled)
                      setError(null)
                      setData((d) => (d ? { ...d, is_cancelled: !d.is_cancelled } : d))
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Could not update the event. Try again.')
                    }
                  })
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-40 ${
                  data.is_cancelled
                    ? 'border-border bg-surface text-text hover:border-border-strong'
                    : 'border-danger/40 bg-surface text-danger hover:bg-danger-bg'
                }`}
              >
                {data.is_cancelled ? 'Reinstate event' : 'Cancel event'}
              </button>
              <span className="flex items-center gap-2">
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
              </span>
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}
