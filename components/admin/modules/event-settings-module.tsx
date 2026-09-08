'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ImagePlus } from 'lucide-react'
import { Input, labelClasses } from '@/components/ui/field'
import { RailAutosaveForm, useRailSaveNow } from '@/components/admin/rail/rail-autosave-form'
import { RailManifestFields } from '@/components/admin/rail/rail-manifest-fields'
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
import { readEventCoverAspect } from '@/lib/events/cover-aspect'
import { readEventCoverFocus } from '@/lib/events/cover-focus'
import { CHECK_IN_HELP } from '@/lib/events/checkin-enabled'
import { MARKET_LISTING_HELP } from '@/lib/events/market-listing'
import type { PlaceResult } from '@/lib/geocode'
import type { FieldDef } from '@/lib/studio/kernel/manifest'
import {
  EVENT_RAIL,
  eventRailValues,
  eventSettingsFormData,
  eventSettingsGroups,
  eventVisibilityField,
  type EventPin,
  type EventRailValues,
} from './event-rail-plan'

// In-place "Event settings" (EMBEDDED-ADMIN.md / ADR-133) on /events/[slug]. This is the SINGLE host
// field editor for the event (the old Place & Time and Engage editor modules folded in here). The rail
// section header is the single title. Every field autosaves and reflects on the page live (text on
// blur, a choice instantly). Images self-save through their own actions; the permalink keeps its own
// action (a rename redirects the page).
//
// THE FIELDS COME FROM THE MANIFEST (ADR-1240, ADR-1281). This module declares no field: `EVENT_RAIL`
// is EVENT_MANIFEST filtered through the kernel's `railForm()` for the columns each save path writes,
// so a label, a kind, an option, or a placement changed on the manifest changes here with no edit to
// this file. The settings form is the plan's fields grouped by manifest section, headed by the
// manifest's own section titles. What this file adds is the six COMPOSITES the plan names
// (`EVENT_COMPOSITES`): the gallery, the venue search, the map pin, co-hosts, placement, and sharing.
//
// HOW THE SETTINGS SAVE READS ITS VALUES. The form's action ignores the FormData snapshot the rail hands
// it and builds the action's FormData from `values` through the plan's key map (camelCase paths to the
// action's snake_case keys, a checkbox always present as on/off) plus the pin. The form still decides
// WHEN (text on blur, a choice instantly); a venue pick or a pin drag commits through `useRailSaveNow`.

// maplibre must never run on the server → dynamically imported, client-only.
const EventLocationPicker = dynamic(() => import('@/components/events/event-location-picker'), {
  ssr: false,
  loading: () => (
    <div className="h-56 w-full animate-pulse rounded-card border border-border bg-surface-elevated" />
  ),
})

type EventData = NonNullable<Awaited<ReturnType<typeof getEventAdminData>>>

const fieldLabel = labelClasses

/** Ghost text is the surface's, not the manifest's (see FieldControlProps.placeholder). */
const PLACEHOLDERS: Record<string, string> = {
  capacity: 'Any',
  priceCents: 'Free',
  onlineUrl: 'https://…',
  venueName: 'e.g. Torus Co.',
}

/** Standing guidance under a control. Also the surface's. */
const HINTS: Record<string, string> = {
  recurrenceUntil: 'Leave blank to repeat indefinitely.',
  hideAddress: 'People browsing see the city only. The venue, street, map pin, and directions show after they RSVP or get a ticket.',
  rsvpRequiresApproval:
    'Requests land in your approval queue instead of taking a spot straight away. A full event still sends approved people to the waitlist.',
  checkInEnabled: CHECK_IN_HELP,
  marketListed: MARKET_LISTING_HELP,
}

const [COVER, MORE_PHOTOS] = EVENT_RAIL.gallery.fields
const [PERMALINK] = EVENT_RAIL.permalink.fields
const GROUPS = eventSettingsGroups()

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
  const slug = pathname.match(/^\/events\/([^/]+)/)?.[1] ?? null

  const [data, setData] = useState<EventData | null>(null)
  const [engage, setEngage] = useState<EventCoreStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let active = true
    getEventAdminData(slug)
      .then((d) => {
        if (active) {
          setData(d)
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

  return <EventSettingsRail key={data.id} data={data} engage={engage} />
}

function EventSettingsRail({ data, engage }: { data: EventData; engage: EventCoreStats | null }) {
  const router = useRouter()
  const eventId = data.id
  const eventSlug = data.slug

  // ONE controlled state for every field on the settings form, keyed by manifest path, plus a ref the
  // form's action reads at save time (a debounced save runs after the render that changed the value).
  const [values, setValues] = useState<EventRailValues>(() => eventRailValues(data))
  const valuesRef = useRef(values)
  // Takes a full Record rather than a Partial: every caller sets concrete strings, and a Partial
  // would widen each value to `string | undefined` and carry that into the merged state.
  const patch = useCallback((next: EventRailValues) => {
    const merged = { ...valuesRef.current, ...next }
    valuesRef.current = merged
    setValues(merged)
  }, [])
  const update = useCallback((path: string, next: string) => patch({ [path]: next }), [patch])

  // The pin is not a field (EVENT_PIN_KEYS): it rides on the map control and is sent beside the values.
  const [pin, setPinState] = useState<EventPin>({ lat: data.lat ?? null, lng: data.lng ?? null })
  const pinRef = useRef(pin)
  const setPin = useCallback((next: EventPin) => {
    pinRef.current = next
    setPinState(next)
  }, [])

  const saveSettings = async () => updateEventSettings(eventId, eventSlug, eventSettingsFormData(valuesRef.current, pinRef.current))

  const [imgErr, setImgErr] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [posterUrl, setPosterUrl] = useState<string | null>(data.posterUrl ?? null)
  const [galleryPaths, setGalleryPaths] = useState<string[]>(data.galleryPaths ?? [])
  const [coverUrl, setCoverUrl] = useState<string | null>(data.coverUrl ?? null)

  const [permalink, setPermalink] = useState(data.slug)
  const [permaErr, setPermaErr] = useState<string | null>(null)
  const [permaPending, startPerma] = useTransition()

  // Resolve an event-media gallery PATH to its public URL (the header preview for the focus control).
  const eventMediaUrl = useCallback(
    (path: string) => createClient().storage.from('event-media').getPublicUrl(path).data.publicUrl,
    [],
  )

  function handleUsePosterAsCover() {
    if (pending) return
    startTransition(async () => {
      const res = await promotePosterToCover(eventId, eventSlug)
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
    if (pending) return
    startTransition(async () => {
      try {
        await removeEventPoster(eventId, eventSlug)
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
    setImgErr(null)
    startTransition(async () => {
      // The result used to be dropped, so a rejected reorder/removal left the new arrangement on
      // screen and the old one in the database: the gallery lied until the next load.
      const res = await setEventGalleryImages(eventId, eventSlug, next)
      if ('error' in res) setImgErr(res.error)
    })
  }

  function handlePermalink() {
    setPermaErr(null)
    startPerma(async () => {
      const res = await updateEventPermalink(eventId, eventSlug, permalink)
      if ('error' in res) {
        setPermaErr(res.error)
      } else {
        router.push(`/events/${res.slug}`)
      }
    })
  }

  // The one derived field: "My circle" is offered only when the event's home IS a Circle (ADR-883).
  const fieldsFor = (fields: readonly FieldDef[]) =>
    fields.map((f) => (f.path === 'visibility' ? eventVisibilityField(f, data.scope_type) : f))
  const hints: Record<string, string> = {
    ...HINTS,
    priceCents: `Leave blank for a free RSVP event. Set a price in ${(data.currency ?? 'usd').toUpperCase()} to sell tickets.`,
  }

  return (
    <div className="space-y-4">
      {/* STATS — the shared core-stats row, pinned at the very top. Same read + component the
          Manage dashboard leads with, in the rail's compact panel variant. */}
      {engage && <EventCoreStatsCards stats={engage} variant="panel" />}

      {/* GALLERY (the plan's `gallery` composite): ONE ordered gallery persists the zone's two
          fields, the cover as its first tile and the rest as more photos. Then the Loom picker, the
          scanned-poster shortcut, and the header controls (focus, aspect, height ride on the cover). */}
      {COVER && MORE_PHOTOS && (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className={fieldLabel}>
              {COVER.label} and {MORE_PHOTOS.label.toLowerCase()}
            </span>
            <MultiImageUpload
              label="Gallery photos"
              value={galleryPaths}
              onChange={handleGalleryChange}
              folder="event-gallery"
              hint="These show on the event page in this order. The first photo is the header. Drag a photo, or use the arrows, to reorder."
              disabled={pending}
              reorderable
              upload={uploadEventGalleryImage.bind(null, eventId, eventSlug)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <EventLoomPicker eventId={eventId} slug={eventSlug} disabled={pending} onAdded={handleAddedFromLoom} />
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
            eventId={eventId}
            slug={eventSlug}
            imageUrl={coverUrl}
            initialFocus={readEventCoverFocus(data.theme)}
            initialAspect={readEventCoverAspect(data.theme)}
            initialHeight={readEventHeroHeight(data.theme)}
          />
          {imgErr && <p className="text-meta font-medium text-danger">{imgErr}</p>}
        </div>
      )}

      {/* THE SETTINGS ZONE: the plan's fields, one group per manifest section, headed by the manifest's
          own titles. The venue search and the map pin (two composites) sit under the `where` group. */}
      <RailAutosaveForm action={saveSettings} className="space-y-4">
        {GROUPS.map(({ section, fields }) => (
          <div key={section.key} className="space-y-3 rounded-card border border-border bg-canvas/40 p-3">
            <div>
              <p className={labelClasses}>{section.title}</p>
              <p className="mt-0.5 text-2xs text-muted">{section.desc}</p>
            </div>
            <RailManifestFields fields={fieldsFor(fields)} values={values} onChange={update} placeholders={PLACEHOLDERS} hints={hints} />
            {section.key === 'where' && (
              <WhereComposites
                attendanceMode={values.attendanceMode}
                pin={pin}
                viewerHome={data.viewerHome ?? null}
                onVenuePick={(p) => {
                  // A venue pick fills the FULL address, sets the one-line place, and drops the pin. Every
                  // part is written UNCONDITIONALLY (null → '') so a fresh pick fully replaces the prior
                  // address rather than leaving a stale part behind. The venue name is left alone: the
                  // host sets that label independently of the map pick.
                  patch({
                    street: p.street ?? '',
                    city: p.city ?? '',
                    region: p.region ?? '',
                    postalCode: p.postalCode ?? '',
                    country: p.country ?? '',
                    location: composeLocation(p),
                  })
                  setPin({ lat: p.lat, lng: p.lng })
                }}
                onPin={setPin}
              />
            )}
          </div>
        ))}
      </RailAutosaveForm>

      {/* Permalink: its own action, a rename redirects the page to the new URL. */}
      {PERMALINK && (
        <div className="space-y-1.5">
          <span className={fieldLabel}>{PERMALINK.label}</span>
          <div className="flex items-center gap-2">
            <span className="flex flex-1 items-center rounded-control border border-border bg-surface px-3 text-body-sm text-subtle">
              <span className="shrink-0">/events/</span>
              <Input
                variant="seamless"
                aria-label={PERMALINK.label}
                value={permalink}
                onChange={(e) => setPermalink(e.target.value)}
                disabled={permaPending}
                className="min-w-0 flex-1 py-2 text-text"
              />
            </span>
            <button
              type="button"
              onClick={handlePermalink}
              disabled={permaPending || !permalink.trim() || permalink.trim() === eventSlug}
              className="inline-flex shrink-0 items-center rounded-control border border-border bg-surface px-3 py-2 text-meta font-semibold text-text transition-colors hover:border-border-strong disabled:opacity-40"
            >
              {permaPending ? 'Saving…' : 'Update'}
            </button>
          </div>
          {permaErr && <span className="text-meta font-medium text-danger">{permaErr}</span>}
        </div>
      )}

      {/* COHOSTS (composite): invite someone to help host, straight from the editor. Its own action. */}
      <EventCohostChooser eventId={eventId} slug={eventSlug} />

      {/* PLACEMENT (composite, the plan's `placement` zone): where the event lives, under a Space or a
          Circle, steward-approved, plus Transfer host. Its own actions. */}
      <EventPlacementField eventId={eventId} slug={eventSlug} />

      {/* SHARE (composite): co-host elsewhere, onto ANOTHER Space's calendar too (Events EC3), without
          moving where it lives. Steward-approved on the other side. Its own actions. */}
      <EventShareField eventId={eventId} slug={eventSlug} />
    </div>
  )
}

/**
 * The two `where` composites: a live venue search that fills the address fields and the pin, and the
 * draggable map pin. Both change the form programmatically, which fires no native change or blur the
 * form could hear, so each commits through the form's own `saveNow`. Meaningful only for an event with
 * a physical place: an online event has no pin to miss, so both step aside for it.
 */
function WhereComposites({
  attendanceMode,
  pin,
  viewerHome,
  onVenuePick,
  onPin,
}: {
  attendanceMode: string | undefined
  pin: EventPin
  viewerHome: { lat: number; lng: number } | null
  onVenuePick: (p: PlaceResult) => void
  onPin: (next: EventPin) => void
}) {
  const saveNow = useRailSaveNow()
  if (attendanceMode === 'online') return null

  // The venue autocomplete biases to the event's pin, else the viewer's home (local-first search).
  const bias = pin.lat != null && pin.lng != null ? { lat: pin.lat, lng: pin.lng } : viewerHome

  return (
    <div className="space-y-3">
      {/* 🔴 THE EVENT HAS NO MAP PIN, AND UNTIL ADR-1029 NOTHING SAID SO. `saveEventLocation` is
          best-effort by contract: a geocode miss leaves `geog` NULL and the save still succeeds, which is
          right. What was missing is the other half: an event with no point vanished from every map and
          every radius-based audience with the host given no reason to suspect it. `lib/event-recurrence.ts`
          carries `geog` in INHERITED_COLUMNS, so one unnoticed miss on a weekly series is sixty invisible
          rows. The condition costs no new read: the pin is hydrated from the decoded `geog`. */}
      {pin.lat == null && pin.lng == null && (
        <Banner tone="warning" title="This event is not on the map yet">
          We could not turn this address into a location. Your event is still published and people can
          still find it, but it will not show on the map until there is a pin. Search for the venue below,
          or drag the pin on the map.
        </Banner>
      )}

      <div className="space-y-1.5">
        <span className={fieldLabel}>
          Search a venue <span className="font-normal text-subtle">(fills the address and drops the pin)</span>
        </span>
        <VenueAutocomplete
          onPick={(p) => {
            onVenuePick(p)
            saveNow()
          }}
          bias={bias}
        />
      </div>

      <div className="space-y-1.5">
        <span className={fieldLabel}>Pin the exact spot</span>
        <EventLocationPicker
          lat={pin.lat}
          lng={pin.lng}
          onChange={(lat, lng) => {
            onPin({ lat, lng })
            saveNow()
          }}
        />
        <p className="text-2xs text-muted">
          Drag the pin or tap the map to set the exact spot. This is the precise venue, not the city-level
          area shown to people browsing.
        </p>
      </div>
    </div>
  )
}
