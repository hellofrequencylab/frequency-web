'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ImagePlus } from 'lucide-react'
import { Field, Input, Textarea, labelClasses } from '@/components/ui/field'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { RailSaveRow } from '@/components/admin/rail/rail-autosave-form'
import { useRailAutosave, isInstant, isTextLike } from '@/components/admin/rail/use-rail-autosave'
import { createClient } from '@/lib/supabase/client'
import {
  getEventAdminData,
  getEventCoreStats,
  updateEventSettings,
  updateEventPermalink,
  removeEventPoster,
  setEventGalleryImages,
  uploadEventGalleryImage,
  // Aliased: it's a server action, not a React hook — the `use*` name would trip the
  // rules-of-hooks lint when called inside a callback.
  useEventPosterAsCover as promotePosterToCover,
} from '@/app/(main)/events/admin-actions'
import { EventCoreStatsCards } from '@/components/events/event-core-stats'
import type { EventCoreStats } from '@/lib/events/event-stats-core'
import { MultiImageUpload } from '@/components/ui/multi-image-upload'
import { Banner } from '@/components/admin/status'
import { EventLoomPicker } from '@/components/admin/modules/event-loom-picker'
import { VenueAutocomplete } from '@/components/admin/venue-autocomplete'
import { EventHeaderControls } from '@/components/admin/modules/event-header-controls'
import { EventCohostChooser } from '@/components/admin/modules/event-cohost-chooser'
import { EventPlacementField } from '@/components/events/event-placement-field'
import { EventShareField } from '@/components/events/event-share-field'
import { readEventHeroHeight } from '@/lib/events/hero-height'
import { readEventCoverFocus } from '@/lib/events/cover-focus'
import {
  readEventCheckInEnabled,
  CHECK_IN_LABEL,
  CHECK_IN_HELP,
} from '@/lib/events/checkin-enabled'
import {
  readEventMarketListed,
  MARKET_LISTING_LABEL,
  MARKET_LISTING_HELP,
} from '@/lib/events/market-listing'
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
// Flow (top to bottom): shared core-stats row (Sold · Revenue · Going · Interested · Waitlist ·
// Checked in · Capacity) · Images · Title · Capacity · Ticket
// price · Description · Starts / Ends / Who / Format / What kind / Energy (+ time zone / repeats) ·
// RSVP window · Location (one live venue search + one map; the street/city/region/postal/country ride
// as hidden derived inputs) · Permalink · Placement.

// maplibre must never run on the server → dynamically imported, client-only.
const EventLocationPicker = dynamic(() => import('@/components/events/event-location-picker'), {
  ssr: false,
  loading: () => (
    <div className="h-56 w-full animate-pulse rounded-card border border-border bg-surface-elevated" />
  ),
})

type EventData = NonNullable<Awaited<ReturnType<typeof getEventAdminData>>>

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
  const [engage, setEngage] = useState<EventCoreStats | null>(null)
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
  const [hideAddress, setHideAddress] = useState(false)
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [marketListed, setMarketListed] = useState(true)
  const [checkInEnabled, setCheckInEnabled] = useState(true)
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
            setHideAddress(d.hide_address === true)
            setRequiresApproval(d.rsvp_requires_approval === true)
            setMarketListed(readEventMarketListed(d.theme))
            setCheckInEnabled(readEventCheckInEnabled(d.theme))
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
    // Core stats — its own read; failure just hides the box. Same shape the Manage
    // dashboard leads with (lib/events/event-stats), rendered via the shared component.
    getEventCoreStats(slug)
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
    return <div className="h-64 animate-pulse rounded-card border border-border bg-surface-elevated/50" />
  }
  if (!data) return null

  // The venue autocomplete biases to the event's pin, else the viewer's home (local-first search).
  const bias = lat != null && lng != null ? { lat, lng } : (data.viewerHome ?? null)

  // A venue pick fills the FULL address, sets the one-line location, drops the pin, then commits.
  // Every field is written UNCONDITIONALLY (null → '') so a fresh pick fully replaces the prior
  // address rather than leaving a stale part behind. The manual Venue name is left alone — the host
  // sets that label independently of the map pick.
  function handleVenuePick(p: PlaceResult) {
    setStreet(p.street ?? '')
    setCity(p.city ?? '')
    setRegion(p.region ?? '')
    setPostalCode(p.postalCode ?? '')
    setCountry(p.country ?? '')
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
    setImgErr(null)
    startTransition(async () => {
      // The result used to be dropped, so a rejected reorder/removal left the new arrangement on
      // screen and the old one in the database: the gallery lied until the next load.
      const res = await setEventGalleryImages(data!.id, data!.slug, next)
      if ('error' in res) setImgErr(res.error)
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
      {/* STATS — the shared core-stats row (item 13), pinned at the very top. Same read +
          component the Manage dashboard leads with, in the rail's compact panel variant. */}
      {engage && <EventCoreStatsCards stats={engage} variant="panel" />}

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
            <div className="space-y-2 rounded-card border border-border bg-surface-elevated/40 p-3">
              <div className="flex items-start gap-3">
                <div className="relative shrink-0 overflow-hidden rounded-card border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={posterUrl} alt={data.title} className="h-24 w-24 object-cover" />
                </div>
                <div className="space-y-2">
                  <p className="text-meta text-subtle">This event was captured from a scanned poster.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleUsePosterAsCover}
                      disabled={pending}
                      className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-meta font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-50"
                    >
                      <ImagePlus className="h-3.5 w-3.5" /> Use it as the header photo
                    </button>
                    <button
                      type="button"
                      onClick={handleRemovePoster}
                      disabled={pending}
                      className="text-2xs font-medium text-muted underline underline-offset-2 transition-colors hover:text-danger disabled:opacity-50"
                    >
                      Remove the scanned poster
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <EventHeaderControls
          eventId={data.id}
          slug={data.slug}
          imageUrl={coverUrl}
          initialFocus={readEventCoverFocus(data.theme)}
          initialHeight={readEventHeroHeight(data.theme)}
        />
        {imgErr && <p className="text-meta font-medium text-danger">{imgErr}</p>}
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
            <Input name="title" defaultValue={data.title} required className="min-w-0" />
          </label>
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Capacity</span>
            <Input name="capacity" type="number" min={1} defaultValue={data.capacity ?? ''} placeholder="Any" className="min-w-0" />
          </label>
        </div>

        {/* HOW PEOPLE JOIN (ADR-826): one join function per event. Automatic derives from
            pricing; RSVP is first come first served (prices show as information); Tickets makes
            buying the way in (no RSVP switch). */}
        <label className="block space-y-1.5">
          <span className={fieldLabel}>How people join</span>
          <Select name="join_mode" defaultValue={data.join_mode ?? 'auto'} wrapperClassName="min-w-0">
            <option value="auto">Automatic (tickets when priced, else RSVP)</option>
            <option value="rsvp">RSVP, first come first served (prices are informational)</option>
            <option value="tickets">Tickets (buying is how people attend)</option>
          </Select>
        </label>

        {/* APPROVAL (20270303000000). event_rsvps.approval_status, the host's approve action and
            this queue have all existed since 20260625020000, but nothing could ever SET a request
            to pending: there was no column on `events` to derive it from and no caller passed the
            flag, so the queue was permanently empty and the feature was a rule about nothing. This
            control is the missing half. Same controlled-hidden-input idiom as hide_address above,
            so the field is always in the autosave snapshot and no other form can reset it.

            Applies identically to members and to signed-out guests — capture_guest_rsvp reads the
            same column, so a guest waits exactly as long as a member does and no longer. */}
        <Checkbox
          checked={requiresApproval}
          onChange={(e) => {
            setRequiresApproval(e.target.checked)
            requestAnimationFrame(saveNow)
          }}
          label="Approve each person before they are in"
          hint="Requests land in your approval queue instead of taking a spot straight away. A full event still sends approved people to the waitlist."
          wrapperClassName="flex pt-1"
        />
        <input type="hidden" name="rsvp_requires_approval" value={requiresApproval ? 'on' : 'off'} />

        {/* CHECK-IN switch (lib/events/checkin-enabled.ts). Check-in is right for a gathering with
            a door — a class, a weekly cowork — and wrong for a planning session, a multi-day
            working block, or a private invite where the only question is "are you coming". Every
            event used to get it the moment it started, with no way to say no. Stored on the
            events.theme bag beside marketListed, so no column and no migration; ON is the default
            so nothing existing changes. Same controlled-hidden-input idiom as the two above. */}
        <Checkbox
          checked={checkInEnabled}
          onChange={(e) => {
            setCheckInEnabled(e.target.checked)
            requestAnimationFrame(saveNow)
          }}
          label={CHECK_IN_LABEL}
          hint={CHECK_IN_HELP}
          wrapperClassName="flex pt-1"
        />
        <input type="hidden" name="checkin_enabled" value={checkInEnabled ? 'on' : 'off'} />

        {/* TICKET PRICE — blank keeps the event a free RSVP. */}
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Ticket price</span>
          <span className="flex items-center rounded-control border border-border bg-surface px-3 text-body-sm text-subtle">
            <span className="shrink-0 uppercase">{data.currency ?? 'usd'}</span>
            <Input
              variant="seamless"
              name="price"
              type="number"
              min={0}
              step="0.01"
              defaultValue={data.price_cents != null && data.price_cents > 0 ? (data.price_cents / 100).toString() : ''}
              placeholder="Free"
              className="min-w-0 flex-1 px-2 py-2 text-text"
            />
          </span>
          <span className="text-2xs text-muted">Leave blank for a free RSVP event. Set a price to sell tickets.</span>
        </label>

        {/* DESCRIPTION */}
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Description</span>
          <Textarea name="description" defaultValue={data.description ?? ''} rows={4} className="resize-none" />
        </label>

        {/* WHEN + WHO — starts / ends / who can see. */}
        <div className="grid grid-cols-3 gap-2">
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Starts</span>
            <Input name="starts_at" type="datetime-local" defaultValue={isoToWallClockInput(data.starts_at)} required className="min-w-0 px-2" />
          </label>
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Ends</span>
            <Input name="ends_at" type="datetime-local" defaultValue={isoToWallClockInput(data.ends_at)} className="min-w-0 px-2" />
          </label>
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Who can see this</span>
            {/* "My circle" is only offered when the event's home IS a circle — on any other scope
                the server steps it down to unlisted (coerceVisibilityForScope, ADR-883), so the
                dead option never renders. Same rule as the member form's filter. */}
            <Select
              name="visibility"
              defaultValue={
                data.scope_type === 'circle'
                  ? data.visibility ?? 'circle_only'
                  : data.visibility === 'circle_only' || !data.visibility
                    ? 'unlisted'
                    : data.visibility
              }
              wrapperClassName="min-w-0"
            >
              {(data.scope_type === 'circle'
                ? VISIBILITY_OPTIONS
                : VISIBILITY_OPTIONS.filter((o) => o.value !== 'circle_only')
              ).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
          {/* Public listing (ADR-844) — a SEPARATE question from who can see it: given a public
              event, is it merchandised when people browse. Controlled hidden input ('on'/'off') so
              the field is always in the autosave snapshot and no other form can silently relist it. */}
          <Checkbox
            checked={marketListed}
            onChange={(e) => {
              setMarketListed(e.target.checked)
              requestAnimationFrame(saveNow)
            }}
            label={MARKET_LISTING_LABEL}
            hint={MARKET_LISTING_HELP}
            wrapperClassName="col-span-full pt-1"
          />
          <input type="hidden" name="market_listed" value={marketListed ? 'on' : 'off'} />
        </div>

        {/* FORMAT / WHAT KIND / ENERGY */}
        <div className="grid grid-cols-3 gap-2">
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Format</span>
            <Select name="attendance_mode" value={mode} onChange={(e) => setMode(e.target.value)} wrapperClassName="min-w-0">
              {ATTENDANCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>What kind</span>
            <Select name="category" defaultValue={data.category ?? 'gathering'} wrapperClassName="min-w-0">
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Energy</span>
            <Select name="energy_tag" defaultValue={data.energy_tag ?? ''} wrapperClassName="min-w-0">
              {ENERGY_OPTIONS.map((o) => (
                <option key={o.value || 'none'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {/* TIME ZONE + REPEATS */}
        <div className="grid grid-cols-2 gap-2">
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Time zone</span>
            <Select name="time_zone" defaultValue={zone} wrapperClassName="min-w-0">
              {zones.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block min-w-0 space-y-1.5">
            <span className={fieldLabel}>Repeats</span>
            <Select name="recurrence_type" value={recurrence} onChange={(e) => setRecurrence(e.target.value)} wrapperClassName="min-w-0">
              {RECURRENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {recurrence !== 'none' && (
          <label className="block space-y-1.5">
            <span className={fieldLabel}>
              Repeat until <span className="font-normal text-subtle">(leave blank to repeat indefinitely)</span>
            </span>
            <Input name="recurrence_until" type="date" defaultValue={isoToDateInput(data.recurrence_until)} className="px-2" />
          </label>
        )}

        {/* Join link (online / hybrid only), toggled by Format. */}
        {mode !== 'in_person' && (
          <label className="block space-y-1.5">
            <span className={fieldLabel}>Join link</span>
            <Input name="online_url" type="url" defaultValue={data.online_url ?? ''} placeholder="https://…" />
          </label>
        )}

        {/* RSVP WINDOW — when people can RSVP. */}
        <div className="space-y-3 rounded-card border border-border bg-surface-elevated/40 p-3">
          <span className={fieldLabel}>
            RSVP window <span className="font-normal text-subtle">(when people can RSVP)</span>
          </span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block min-w-0 space-y-1.5">
              <span className={fieldLabel}>RSVPs open</span>
              <Input name="rsvp_opens_at" type="datetime-local" defaultValue={isoToWallClockInput(data.rsvpOpensAt)} className="min-w-0 px-2" />
            </label>
            <label className="block min-w-0 space-y-1.5">
              <span className={fieldLabel}>RSVPs close</span>
              <Input name="rsvp_closes_at" type="datetime-local" defaultValue={isoToWallClockInput(data.rsvpClosesAt)} className="min-w-0 px-2" />
            </label>
          </div>
        </div>

        {/* LOCATION — a manual Venue name on top, then a live venue search that fills the address and
            drops the pin, then the editable address fields, then the map. Picking a venue or dragging
            the pin sets the address; the host can also type any field by hand. Kept inside the
            non-online guard so that switching to Online submits them empty → the stored address
            clears (as before). */}
        {mode !== 'online' && (
          <div className="space-y-3">
            {/* 🔴 THE EVENT HAS NO MAP PIN, AND UNTIL NOW NOTHING SAID SO (ADR-1029).
                `saveEventLocation` is best-effort by contract: a geocode miss leaves `geog` NULL and
                the save still succeeds, which is right — a host must never lose their work because a
                third-party geocoder shrugged. What was missing is the other half. Nothing downstream
                noticed, so an event simply vanished from the Around You map, the events-index map,
                its own page's mini-map, and every radius-based dispatch audience, with the host
                given no reason to suspect it.

                Production had exactly that: "Breath Is Life", published and public, with no point,
                because its venue box read "The Royal Temple (RSVP to see location)" and no provider
                resolves that sentence.

                ⚠️ WORSE THAN ONE EVENT: lib/event-recurrence.ts carries `geog` in INHERITED_COLUMNS,
                so a NULL-geog ANCHOR propagates NULL into every occurrence it mints. One unnoticed
                miss on a weekly series is sixty invisible rows.

                The condition costs no new read: `lat`/`lng` are already hydrated from the decoded
                `geog` (getEventAdminData decodes it server-side), and the `mode !== 'online'` guard
                this sits inside is already the correct one — an online event has no pin to miss. */}
            {lat == null && lng == null && (
              <Banner tone="warning" title="This event is not on the map yet">
                We could not turn this address into a location. Your event is still published and
                people can still find it, but it will not show on the map until there is a pin.
                Search for the venue above, or drag the pin on the map below.
              </Banner>
            )}

            <div className="space-y-3 rounded-card border border-border bg-surface-elevated/40 p-3">
              <span className={fieldLabel}>Location</span>

              {/* Venue name — the host's own label for the place (e.g. "Torus Co."), set by hand and
                  independent of the map pick. */}
              <label className="block space-y-1.5">
                <span className={fieldLabel}>Venue name</span>
                <Input
                  name="venue_name"
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  placeholder="e.g. Torus Co."
                />
              </label>

              {/* Live venue search — pick a result to fill the address below and drop the pin. */}
              <div className="space-y-1.5">
                <span className={fieldLabel}>
                  Search a venue{' '}
                  <span className="font-normal text-subtle">(fills the address and drops the pin)</span>
                </span>
                <VenueAutocomplete onPick={handleVenuePick} bias={bias} />
              </div>

              {/* The full address — filled by a pick, editable by hand. Each part carries a real
                  <label> rather than a placeholder: a placeholder disappears the moment the field
                  has a value, so a host tabbing back through a filled-in address had five boxes of
                  text and nothing saying which was which. */}
              <Field label="Street address">
                <Input name="street" value={street} onChange={(e) => setStreet(e.target.value)} />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="City" className="min-w-0">
                  <Input name="city" value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
                <Field label="State or province" className="min-w-0">
                  <Input name="region" value={region} onChange={(e) => setRegion(e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Postal code" className="min-w-0">
                  <Input name="postal_code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
                </Field>
                <Field label="Country" className="min-w-0">
                  <Input name="country" value={country} onChange={(e) => setCountry(e.target.value)} />
                </Field>
              </div>

              {/* Hidden address (ADR-825). A controlled HIDDEN input ('on'/'off') so the field is
                  ALWAYS present in the autosave snapshot — the action only writes when present, so
                  no other form can silently reset it. */}
              <Checkbox
                checked={hideAddress}
                onChange={(e) => {
                  setHideAddress(e.target.checked)
                  requestAnimationFrame(saveNow)
                }}
                label="Hide the address until someone registers"
                hint="People browsing see the city only. The venue, street, map pin, and directions show after they RSVP or get a ticket."
                wrapperClassName="flex pt-1"
              />
              <input type="hidden" name="hide_address" value={hideAddress ? 'on' : 'off'} />
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
              <p className="text-2xs text-muted">
                Drag the pin or tap the map to set the exact spot. This is the precise venue, not the
                city-level area shown to people browsing.
              </p>
            </div>

            {/* Hidden derived inputs — the composed one-line location + the pin coordinates. */}
            <input type="hidden" name="location" value={location} />
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
          <span className="flex flex-1 items-center rounded-control border border-border bg-surface px-3 text-body-sm text-subtle">
            <span className="shrink-0">/events/</span>
            <Input
              variant="seamless"
              aria-label="Permalink"
              value={permalink}
              onChange={(e) => setPermalink(e.target.value)}
              disabled={permaPending}
              className="min-w-0 flex-1 py-2 text-text"
            />
          </span>
          <button
            type="button"
            onClick={handlePermalink}
            disabled={permaPending || !permalink.trim() || permalink.trim() === data.slug}
            className="inline-flex shrink-0 items-center rounded-control border border-border bg-surface px-3 py-2 text-meta font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-40"
          >
            {permaPending ? 'Saving…' : 'Update'}
          </button>
        </div>
        {permaErr && <span className="text-meta font-medium text-danger">{permaErr}</span>}
      </div>

      {/* COHOSTS — invite someone to help host, straight from the editor. Its own action. */}
      <EventCohostChooser eventId={data.id} slug={data.slug} />

      {/* WHERE IT LIVES — placement under a Space or Circle (steward-approved), plus Transfer host.
          Its own actions. */}
      <EventPlacementField eventId={data.id} slug={data.slug} />

      {/* CO-HOST ELSEWHERE — share the event onto ANOTHER Space's calendar too (Events EC3), without
          moving where it lives. Steward-approved on the other side. Its own actions. */}
      <EventShareField eventId={data.id} slug={data.slug} />
    </div>
  )
}
