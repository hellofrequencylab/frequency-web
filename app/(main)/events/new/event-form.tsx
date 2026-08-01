'use client'

import { useMemo, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createEvent, updateEvent } from '@/app/(main)/events/actions'
import { isError } from '@/lib/action-result'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'
import { ImageUpload } from '@/components/ui/image-upload'
import { MultiImageUpload } from '@/components/ui/multi-image-upload'
import { VenueAutocomplete } from '@/components/admin/venue-autocomplete'
import type { PlaceResult } from '@/lib/geocode'
// The category vocabulary comes from the ONE source (lib/events/options.ts) — this form used to
// inline an identical copy, which is exactly the drift check:vocab now fails the build on.
import { CATEGORY_OPTIONS } from '@/lib/events/options'

// The draggable-pin location picker runs MapLibre, which must never touch the server, so it
// lazy-mounts client-only (ssr:false) — the same dynamic-import pattern as EventLocationMap.
const EventLocationPicker = dynamic(() => import('@/components/events/event-location-picker'), {
  ssr: false,
  loading: () => (
    <div className="aspect-video w-full animate-pulse rounded-xl border border-border bg-surface-elevated" />
  ),
})

// Today in the VIEWER's local timezone, as the `YYYY-MM-DD` a date/datetime-local
// input seeds with. Built from local parts (never `toISOString().slice`, which is
// UTC and would show "yesterday" for a viewer west of UTC late in the day).
function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// A scope option the form can offer: Public, a circle the caller HOSTS, or a space they
// RUN. `kind`/`label` are optional so the edit page (which passes `groups={[]}`) and any
// legacy caller passing `{id,name}` still type-check; the create page fills them in.
type Group = {
  id: string
  name: string
  /** 'circle' (you host) or 'space' (you own/steward). Absent = treated as a circle. */
  kind?: 'circle' | 'space'
  /** Optional long-form label; the select falls back to the name inside its optgroup. */
  label?: string
}

// A Journey the caller may link this event to. Deliberately NOT a `Group`: a Journey is an
// ASSOCIATION, not a scope — linking one does not change where the event lives, so it gets its own
// field rather than an optgroup in "Where does it live?". The page offers only Journeys the caller
// can edit, and the server re-checks that same authority on submit.
type JourneyOption = { id: string; title: string }

type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly'
type PriceMode = 'free' | 'paid'

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string; helper: string }[] = [
  { value: 'none',    label: 'One-time',  helper: 'Happens once'                          },
  { value: 'daily',   label: 'Every day', helper: 'Same time each day'                    },
  { value: 'weekly',  label: 'Weekly',    helper: 'Same day & time each week'             },
  { value: 'monthly', label: 'Monthly',   helper: 'Same date each month'                  },
]

// Who can see the event once it is live.
const VISIBILITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'public',      label: 'Anyone'               },
  { value: 'circle_only', label: 'My circle'            },
  { value: 'unlisted',    label: 'Anyone with the link' },
  { value: 'private',     label: 'Invite only'          },
]

// Blank = unset. How the gathering tends to land on the nervous system.
const ENERGY_OPTIONS: { value: string; label: string }[] = [
  { value: '',                label: 'Not sure yet'     },
  { value: 'grounding',       label: 'Grounding'        },
  { value: 'high_activation', label: 'High activation'  },
  { value: 'social',          label: 'Social'           },
  { value: 'ceremonial',      label: 'Ceremonial'       },
]

// How people attend. in_person events resolve to a map point from the address
// below; online events carry a link instead; hybrid carries both.
const ATTENDANCE_OPTIONS: { value: 'in_person' | 'online' | 'hybrid'; label: string }[] = [
  { value: 'in_person', label: 'In person' },
  { value: 'online',    label: 'Online'    },
  { value: 'hybrid',    label: 'Both'      },
]

// The prefill shape for edit mode — mirrors the form's own fields. Every field is read
// through `Partial<EventFormInitial>`, so new fields stay OPTIONAL and the edit page keeps
// compiling without setting them.
export interface EventFormInitial {
  title: string
  description: string
  location: string
  scopeId: string
  /** datetime-local value (YYYY-MM-DDTHH:mm). */
  startsAt: string
  endsAt: string
  /** Recurrence cadence (none/daily/weekly/monthly). */
  recurrenceType: RecurrenceType
  /** date value (YYYY-MM-DD) the series repeats until, or '' for indefinite. */
  recurrenceUntil: string
  capacity: string
  visibility: string
  category: string
  energyTag: string
  attendanceMode: 'in_person' | 'online' | 'hybrid'
  onlineUrl: string
  venueName: string
  street: string
  city: string
  region: string
  postalCode: string
  country: string
  /** Storage path in the public event-media bucket (resolved to a URL at render). */
  coverImagePath: string
  /** Additional gallery image paths (event-media bucket), beyond the cover. */
  galleryImagePaths: string[]
  /** Ticket price in whole cents. 0 or absent = a free RSVP event. */
  priceCents?: number
  /** The event's stored venue point (edit mode) — seeds the map pin when present. */
  venueLat?: number
  venueLng?: number
  /** Host-only practical notes (parking, what to bring, door code, accessibility). */
  specialInstructions?: string
  /** The Journey this event is part of (events.journey_id), or '' for none. */
  journeyId?: string
}

// A grouped, tokenized section wrapper so the form reads as five clear steps instead of a
// long unbroken column. Heading + optional one-line helper, then the fields.
function FormSection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4 border-t border-border pt-6 first:border-t-0 first:pt-0">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {hint ? <p className="text-2xs leading-relaxed text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

export function EventForm({
  groups,
  journeys,
  initial,
  eventId,
  currentScopeName,
  scopeIsCircle,
  backHref,
  defaultGroupId,
  home,
}: {
  groups: Group[]
  /** Journeys the caller may link this event to (create AND edit). Empty/absent hides the field. */
  journeys?: JourneyOption[]
  /** When set (with `eventId`), the form prefills and edits the event. */
  initial?: Partial<EventFormInitial>
  /** When set, the form edits this event via updateEvent instead of createEvent. */
  eventId?: string
  /** In edit mode, where the event lives now (the scope can't be changed here). */
  currentScopeName?: string
  /** In edit mode, whether that fixed scope IS a circle (scope_type='circle'). Drives whether
   *  the "My circle" visibility is offered — it only means something on a circle event, and the
   *  server steps it down to unlisted everywhere else (ADR-883). Absent = treated as a circle. */
  scopeIsCircle?: boolean
  /** Where the Cancel link returns to (defaults to /events). */
  backHref?: string
  /** Pre-selected scope on create (from the `?circle=` deep link, already validated to one
   *  of the caller's own hosted circles by the page). */
  defaultGroupId?: string
  /** The viewer's saved home {lat,lng}, used to bias the venue autocomplete before a pin
   *  exists so the FIRST, local-bounded pass has an anchor. Null when the viewer has no home. */
  home?: { lat: number; lng: number } | null
}) {
  const isEdit = !!eventId
  // Sentinel scope for a standalone PUBLIC event (any nearby member — no circle/space needed).
  // createEvent reads scopeType='public' and places it in the creator's region.
  const PUBLIC_SCOPE = '__public__'
  // Space options carry this prefix in the <select> value so the submit handler can tell a
  // space from a circle without a lookup; circles keep their bare id (so a `?circle=` deep
  // link and the Duplicate prefill, which pass a bare circle id, still select correctly).
  const SPACE_PREFIX = 'space:'
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // A failed save surfaces HERE (the actions return ActionResult); the editor stays open with
  // the message instead of silently pretending success.
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  // A `?space=` deep link (the Space Calendar console "New event" button) passes the BARE space id as
  // defaultGroupId, but the space <option> values are SPACE_PREFIX-encoded so the submit handler can tell a
  // space from a circle. Encode a space default to match its option — otherwise the <select> can't
  // preselect it and the event silently falls back to Public (attributed to the person, not the Space).
  // A circle default (`?circle=`) and the Duplicate prefill already pass a bare circle id, which matches.
  const encodedDefaultGroupId =
    defaultGroupId && groups.some((g) => g.id === defaultGroupId && g.kind === 'space')
      ? SPACE_PREFIX + defaultGroupId
      : defaultGroupId
  // Default to PUBLIC on create (any member can post a local event); a circle/space is opt-in.
  // A deep-link circle/space or a Duplicate prefill wins when present.
  const [scopeId, setScopeId] = useState(initial?.scopeId ?? encodedDefaultGroupId ?? PUBLIC_SCOPE)
  // The Journey this event is part of — a separate axis from the scope above. '' = not part of one.
  const [journeyId, setJourneyId] = useState(initial?.journeyId ?? '')
  // PART 2: on create, the date field defaults to the viewer's current (active) local day at a
  // sensible hour, so it is never blank or tz-shifted to yesterday. Edit keeps the event's real
  // stored time. `localToday()` is read once at mount (a stable seed).
  const [startsAt, setStartsAt] = useState(
    initial?.startsAt ?? (isEdit ? '' : `${localToday()}T18:00`),
  )
  const [endsAt, setEndsAt] = useState(initial?.endsAt ?? '')
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
    initial?.recurrenceType ?? 'none',
  )
  const [recurrenceUntil, setRecurrenceUntil] = useState(initial?.recurrenceUntil ?? '')
  const [capacity, setCapacity] = useState(initial?.capacity ?? '')
  // Default visibility to Anyone, matching the default PUBLIC scope. The server re-coerces an
  // invalid combination (e.g. circle_only on a public event steps down to unlisted, ADR-883)
  // so this can never save a bad pair; the same step-down seeds edit mode here so a stored
  // bad pair rounds a broken row to what the next save would write anyway.
  const [visibility, setVisibility] = useState(() => {
    const seeded = initial?.visibility ?? (isEdit ? 'circle_only' : 'public')
    return isEdit && scopeIsCircle === false && seeded === 'circle_only' ? 'unlisted' : seeded
  })
  const [category, setCategory] = useState(initial?.category ?? 'gathering')
  const [energyTag, setEnergyTag] = useState(initial?.energyTag ?? '')
  const [attendanceMode, setAttendanceMode] = useState<'in_person' | 'online' | 'hybrid'>(
    initial?.attendanceMode ?? 'in_person',
  )
  const [onlineUrl, setOnlineUrl] = useState(initial?.onlineUrl ?? '')
  const [venueName, setVenueName] = useState(initial?.venueName ?? '')
  const [street, setStreet] = useState(initial?.street ?? '')
  const [city, setCity] = useState(initial?.city ?? '')
  const [region, setRegion] = useState(initial?.region ?? '')
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? '')
  const [country, setCountry] = useState(initial?.country ?? '')
  const [coverImagePath, setCoverImagePath] = useState<string | null>(initial?.coverImagePath || null)
  const [galleryImagePaths, setGalleryImagePaths] = useState<string[]>(initial?.galleryImagePaths ?? [])
  // Price: Free vs a set amount. Seeds paid from a prefilled price (Duplicate / a future edit
  // round-trip); the amount is held as a plain dollars string and converted to cents on submit.
  const [priceMode, setPriceMode] = useState<PriceMode>(
    initial?.priceCents && initial.priceCents > 0 ? 'paid' : 'free',
  )
  const [priceAmount, setPriceAmount] = useState(
    initial?.priceCents && initial.priceCents > 0 ? (initial.priceCents / 100).toString() : '',
  )
  // The manually-placed map pin. Seeds from the stored venue point on edit; a drag or an
  // autocomplete pick updates it, and a set pin OVERRIDES the address geocode on save.
  const [venueLat, setVenueLat] = useState<number | null>(
    typeof initial?.venueLat === 'number' ? initial.venueLat : null,
  )
  const [venueLng, setVenueLng] = useState<number | null>(
    typeof initial?.venueLng === 'number' ? initial.venueLng : null,
  )
  // Practical host notes (parking, what to bring, door code, accessibility). Optional.
  const [specialInstructions, setSpecialInstructions] = useState(initial?.specialInstructions ?? '')

  // Split the scope options into their two optgroups (circles you host / spaces you run).
  const circleOptions = useMemo(() => groups.filter((g) => g.kind !== 'space'), [groups])
  const spaceOptions = useMemo(() => groups.filter((g) => g.kind === 'space'), [groups])

  // Whether the SELECTED scope is a circle: fixed by prop on edit (the scope can't change
  // there), derived live from the select on create (a bare circle id = circle; the public
  // sentinel and the space: prefix are not).
  const selectedScopeIsCircle = isEdit
    ? scopeIsCircle ?? true
    : scopeId !== PUBLIC_SCOPE && !scopeId.startsWith(SPACE_PREFIX)
  // "My circle" is only offered when there IS a circle to scope to. On any other target the
  // server steps it down to unlisted anyway (ADR-883), so the dead option never renders.
  const visibilityOptions = selectedScopeIsCircle
    ? VISIBILITY_OPTIONS
    : VISIBILITY_OPTIONS.filter((o) => o.value !== 'circle_only')

  // The Journey field only renders when there is a real choice to make, AND when the event's
  // CURRENT link is one of the offered options. An event can be linked by a Journey's author to a
  // Journey this host does not run: the select could not show it, so leaving the field on would let
  // an unrelated save silently detach it. Hidden means no `journeyId` is submitted at all, and the
  // action treats an absent field as "leave the link exactly as it is".
  const journeyOptions = useMemo(() => journeys ?? [], [journeys])
  const showJourneyField =
    journeyOptions.length > 0 &&
    (!initial?.journeyId || journeyOptions.some((j) => j.id === initial.journeyId))

  // A venue/address autocomplete pick fills the structured fields AND drops the map pin at the
  // resolved point, which recenters the picker — the "map recenters when the address is
  // geocoded" path. The host can still drag the pin afterwards to fine-tune the exact spot.
  const onPickVenue = (p: PlaceResult) => {
    if (p.name) setVenueName(p.name)
    if (p.street) setStreet(p.street)
    if (p.city) setCity(p.city)
    if (p.region) setRegion(p.region)
    if (p.postalCode) setPostalCode(p.postalCode)
    if (p.country) setCountry(p.country)
    setVenueLat(p.lat)
    setVenueLng(p.lng)
  }

  // Client guard for the repeat-end date: when a cadence is set and an end is given,
  // it must be after the start day (the server re-validates the same rule). The until
  // is a date (YYYY-MM-DD); compare it to the start's date portion.
  const recurrenceError = useMemo(() => {
    if (recurrenceType === 'none' || !recurrenceUntil) return null
    const startDay = startsAt.slice(0, 10)
    if (startDay && recurrenceUntil <= startDay) return 'The repeat end date must be after the start.'
    return null
  }, [recurrenceType, recurrenceUntil, startsAt])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !scopeId || !startsAt || isPending) return
    if (recurrenceError) return

    const fd = new FormData()
    fd.set('title', title.trim())
    fd.set('coverImagePath', coverImagePath ?? '')
    // Gallery paths ride as a JSON array (FormData has no native array shape); the
    // server parses + re-validates. Empty array clears the gallery.
    fd.set('galleryImagePaths', JSON.stringify(galleryImagePaths))
    fd.set('description', description.trim())
    fd.set('location', location.trim())

    // Where it lives → scopeType + scopeId. The value encodes the kind: the public sentinel,
    // a `space:` prefix, or a bare circle id. The server RE-VALIDATES ownership before writing
    // any circle/space, so this client hint is never trusted on its own.
    let scopeType: 'public' | 'circle' | 'space'
    let outScopeId = ''
    if (scopeId === PUBLIC_SCOPE) {
      scopeType = 'public'
    } else if (scopeId.startsWith(SPACE_PREFIX)) {
      scopeType = 'space'
      outScopeId = scopeId.slice(SPACE_PREFIX.length)
    } else {
      scopeType = 'circle'
      outScopeId = scopeId
    }
    fd.set('scopeType', scopeType)
    fd.set('scopeId', outScopeId)

    // The Journey link rides SEPARATELY from the scope, because it is not one: the server writes it
    // to its own column and never touches the placement. Sent only when the field was shown, so a
    // form that could not offer the current link leaves it untouched instead of clearing it. Blank
    // is a real value here (detach); the server re-checks the Journey authority before attaching.
    if (showJourneyField) fd.set('journeyId', journeyId)

    fd.set('startsAt', startsAt)
    if (endsAt) fd.set('endsAt', endsAt)
    // Recurrence is editable on both create and edit. The server re-validates + re-
    // materialises the occurrence window when the cadence changes (the cron is the backstop).
    fd.set('recurrenceType', recurrenceType)
    if (recurrenceType !== 'none' && recurrenceUntil) {
      fd.set('recurrenceUntil', recurrenceUntil)
    }
    fd.set('category', category)
    fd.set('visibility', visibility)
    if (capacity.trim()) fd.set('capacity', capacity.trim())
    if (energyTag) fd.set('energyTag', energyTag)

    // Price. In EDIT mode the editor round-trips the current price, so we always send an explicit
    // signal: a paid price sends its cents, and Free sends '0' (parsePriceCents('0') → null) so
    // updateEvent actually clears the price. Without this, flipping a paid event to Free sent
    // nothing and the old price silently persisted (attendees kept getting charged). In CREATE mode
    // a free event sends NO field, which createEvent reads as null.
    const cents = Math.round(parseFloat(priceAmount.replace(/[^0-9.]/g, '')) * 100)
    const paidCents = priceMode === 'paid' && Number.isFinite(cents) && cents > 0 ? cents : 0
    if (isEdit) {
      fd.set('priceCents', String(paidCents))
    } else if (paidCents > 0) {
      fd.set('priceCents', String(paidCents))
    }

    // Geolocation (EVENTS-REWORK B1). Attendance mode drives whether the address
    // geocodes; the structured fields resolve to a map point on save, online events
    // carry a join link instead. All optional — a blank address simply leaves the
    // event without a point until it's filled in later.
    fd.set('attendanceMode', attendanceMode)
    if (attendanceMode !== 'in_person' && onlineUrl.trim()) fd.set('onlineUrl', onlineUrl.trim())
    if (attendanceMode !== 'online') {
      if (venueName.trim()) fd.set('venueName', venueName.trim())
      if (street.trim()) fd.set('street', street.trim())
      if (city.trim()) fd.set('city', city.trim())
      if (region.trim()) fd.set('region', region.trim())
      if (postalCode.trim()) fd.set('postalCode', postalCode.trim())
      if (country.trim()) fd.set('country', country.trim())
      // The dragged/picked pin. When set, the server persists THIS exact point (via the
      // explicitPoint path in geocode.ts) instead of geocoding the address, so a manual pin wins.
      if (venueLat != null && venueLng != null) {
        fd.set('venueLat', String(venueLat))
        fd.set('venueLng', String(venueLng))
      }
    }

    // Special instructions (optional). Only sent when non-empty, so a blank edit never wipes a
    // stored note — mirrors the price field's "a blank never clears a set value" contract.
    if (specialInstructions.trim()) fd.set('specialInstructions', specialInstructions.trim())

    startTransition(async () => {
      setSubmitError(null)
      const res = isEdit ? await updateEvent(eventId, fd) : await createEvent(fd)
      if (isError(res)) {
        // Keep the editor open and show what went wrong — never close on a failed save.
        setSubmitError(res.error)
        return
      }
      router.push(`/events/${res.data.slug}`)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      {/* Instructional header — set the tone: fill in what you have, refine the rest later. */}
      <div className="rounded-xl border border-border bg-surface-elevated/40 p-4">
        <h1 className="text-base font-semibold text-text">
          {isEdit ? 'Edit your event' : 'Set up your event'}
        </h1>
        <p className="mt-1 text-2xs leading-relaxed text-muted">
          A title and a start time are all you need to begin. Everything else is optional, so add
          the address, cover photo, or price when you have them and come back to fill in the rest
          any time.
        </p>
      </div>

      {/* ── Basics ─────────────────────────────────────────────────────────── */}
      <FormSection title="Basics" hint="What it is, and the photo people see first.">
        {/* Title + kind sit side by side on desktop, single column on mobile. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm text-text" htmlFor="event-title">
              Event title <span className="text-danger">*</span>
            </Label>
            <Input id="event-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Wednesday Morning Ride"
              required
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-text" htmlFor="event-category">What kind of gathering is this?</Label>
            <select id="event-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={isPending}
              className={fieldClasses}
            >
              {CATEGORY_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cover image — the poster / main image (hero + first item in the gallery). */}
        <ImageUpload
          label="Cover image"
          value={coverImagePath}
          onChange={setCoverImagePath}
          mode="path"
          folder="event-covers"
          hint="The poster, shown at the top of the event and first in the gallery."
          disabled={isPending}
        />

        {/* Gallery — tucked inside a disclosure so it stays out of the way until wanted. */}
        <details className="group rounded-xl border border-border bg-surface-elevated/40">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
            <span>
              More photos{' '}
              {galleryImagePaths.length > 0 && (
                <span className="text-2xs font-normal text-subtle">({galleryImagePaths.length} added)</span>
              )}
            </span>
            <span aria-hidden className="text-subtle transition-transform group-open:rotate-180">
              ⌄
            </span>
          </summary>
          <div className="border-t border-border px-4 py-3">
            <MultiImageUpload
              label="More photos"
              value={galleryImagePaths}
              onChange={setGalleryImagePaths}
              folder="event-gallery"
              hint="Optional. Extra photos shown in a gallery below the poster."
              disabled={isPending}
            />
          </div>
        </details>
      </FormSection>

      {/* ── Details & timing ──────────────────────────────────────────────── */}
      <FormSection title="Details and timing" hint="The write-up on the left; when it happens in the rail beside it.">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Description — the wide left column (~2/3). */}
          <div className="space-y-1.5 lg:col-span-2">
            <Label className="text-sm text-text" htmlFor="event-description">
              Description <span className="text-2xs font-normal text-subtle">(optional)</span>
            </Label>
            <Textarea id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details, what to bring, meetup point…"
              rows={12}
              disabled={isPending}
              className="h-full min-h-48 resize-none leading-relaxed"
            />
          </div>

          {/* Time rail — the narrow right column (~1/3): Starts, Ends, Repeats stacked. */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm text-text" htmlFor="event-starts-at">
                Starts at <span className="text-danger">*</span>
              </Label>
              <Input id="event-starts-at"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-text" htmlFor="event-ends-at">
                Ends at <span className="text-2xs font-normal text-subtle">(optional)</span>
              </Label>
              <Input id="event-ends-at"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                // Seed the empty picker on the start day (today on create), never a past default.
                min={startsAt || `${localToday()}T00:00`}
                disabled={isPending}
              />
            </div>

            {/* Recurrence — set the cadence on create, change it on edit. */}
            <div className="space-y-1.5">
              {/* A button group is not a labelable control, so `htmlFor` has nothing to point at:
                  the accessible name comes from role="group" + aria-labelledby instead. */}
              <Label className="text-sm text-text" id="event-repeats-label">Repeats</Label>
              <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="event-repeats-label">
                {RECURRENCE_OPTIONS.map(({ value, label, helper }) => {
                  const active = recurrenceType === value
                  return (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setRecurrenceType(value)}
                      disabled={isPending}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        active
                          ? 'border-primary bg-primary-bg ring-2 ring-primary/30'
                          : 'border-border bg-surface hover:border-border-strong'
                      } disabled:opacity-60`}
                    >
                      <p className={`text-sm font-medium ${active ? 'text-primary-strong' : 'text-text'}`}>
                        {label}
                      </p>
                      <p className="mt-0.5 text-2xs text-muted">{helper}</p>
                    </button>
                  )
                })}
              </div>
              {recurrenceType !== 'none' && (
                <div className="mt-3 space-y-1.5">
                  <Label className="text-text" htmlFor="event-recurrence-until">
                    Ends on <span className="text-subtle">(optional, leave blank for indefinite)</span>
                  </Label>
                  <Input id="event-recurrence-until"
                    type="date"
                    value={recurrenceUntil}
                    onChange={(e) => setRecurrenceUntil(e.target.value)}
                    // Empty picker opens on the start day / today, never a past month.
                    min={startsAt.slice(0, 10) || localToday()}
                    disabled={isPending}
                  />
                  {recurrenceError ? (
                    <p className="mt-1.5 text-2xs text-danger">{recurrenceError}</p>
                  ) : (
                    <p className="mt-1.5 text-2xs text-muted">
                      The next 60 days of dates show right away. A daily job rolls the window forward.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </FormSection>

      {/* ── Where ─────────────────────────────────────────────────────────── */}
      <FormSection title="Where" hint="Add an address for in-person events so people nearby can find it on the map.">
        <div className="space-y-1.5">
          <Label className="text-sm text-text" id="event-attendance-label">How do people attend?</Label>
          <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="event-attendance-label">
            {ATTENDANCE_OPTIONS.map(({ value, label }) => {
              const active = attendanceMode === value
              return (
                <button
                  type="button"
                  key={value}
                  onClick={() => setAttendanceMode(value)}
                  disabled={isPending}
                  className={`rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors ${
                    active
                      ? 'border-primary bg-primary-bg text-primary-strong ring-2 ring-primary/30'
                      : 'border-border bg-surface text-text hover:border-border-strong'
                  } disabled:opacity-60`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Online join link (online / hybrid only) */}
        {attendanceMode !== 'in_person' && (
          <div className="space-y-1.5">
            <Label className="text-sm text-text" htmlFor="event-online-url">
              Join link <span className="text-2xs font-normal text-subtle">(optional)</span>
            </Label>
            <Input id="event-online-url"
              type="url"
              value={onlineUrl}
              onChange={(e) => setOnlineUrl(e.target.value)}
              placeholder="https://…"
              disabled={isPending}
            />
            <p className="mt-1.5 text-2xs text-muted">Where people connect. Shared with attendees.</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-sm text-text" htmlFor="event-location">
            Location <span className="text-2xs font-normal text-subtle">(optional)</span>
          </Label>
          <Input id="event-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Balboa Park, San Diego"
            disabled={isPending}
          />
          <p className="mt-1.5 text-2xs text-muted">
            A short, friendly place name. The exact address below is what pins the map.
          </p>
        </div>

        {/* Structured address (in person / hybrid). Used to place the event on the map. Leave
            blank to skip the map; the event still saves. Address block is ROW ONE; the live,
            draggable map sits in ROW TWO beneath it (stacked, full width). */}
        {attendanceMode !== 'online' && (
          <div className="space-y-4">
            {/* Row one — the structured address. */}
            {/* "Address" heads a GROUP of controls (the typeahead plus street/city/state/zip), not a
                single one, so it names the group rather than pointing `htmlFor` at one of them. */}
            <div
              className="space-y-3 rounded-xl border border-border bg-surface-elevated/40 p-4"
              role="group"
              aria-labelledby="event-address-label"
            >
              <div className="space-y-1">
                <Label className="text-sm text-text" id="event-address-label">
                  Address <span className="text-2xs font-normal text-subtle">(optional, for the map)</span>
                </Label>
                <p className="text-2xs text-muted">
                  Start typing a venue or address and pick it to fill the rest and drop the pin. Then
                  drag the pin below to set the exact spot.
                </p>
              </div>
              {/* Typeahead: a pick fills the address fields and recenters the map pin. */}
              <VenueAutocomplete
                value={venueName}
                onPick={onPickVenue}
                placeholder="Search a venue or address"
                disabled={isPending}
                // The current pin is the best bias; before one exists, fall back to the viewer's
                // home so the search is NEVER unbiased (the device's own geolocation still wins
                // over both inside VenueAutocomplete when the browser grants it).
                bias={
                  venueLat != null && venueLng != null
                    ? { lat: venueLat, lng: venueLng }
                    : home ?? null
                }
              />
              <Input
                type="text"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Street address"
                disabled={isPending}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  disabled={isPending}
                />
                <Input
                  type="text"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="State or province"
                  disabled={isPending}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="Postal code"
                  disabled={isPending}
                />
                <Input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Country"
                  disabled={isPending}
                />
              </div>
            </div>

            {/* Row two — the live map with a DRAGGABLE pin. Dragging (or tapping) it sets the
                exact lat/lng we save; picking an address above recenters it. Full width, stacked. */}
            <div className="space-y-1.5">
              <EventLocationPicker
                lat={venueLat}
                lng={venueLng}
                onChange={(lat, lng) => {
                  setVenueLat(lat)
                  setVenueLng(lng)
                }}
              />
              <p className="text-2xs text-muted">
                {venueLat != null && venueLng != null
                  ? 'Drag the pin to set the exact spot. This point is what shows on the map.'
                  : 'Drag or tap the map to drop a pin on the exact spot, or pick an address above.'}
              </p>
            </div>
          </div>
        )}
      </FormSection>

      {/* ── Who can see it ────────────────────────────────────────────────── */}
      <FormSection title="Who can see it" hint="Where the event lives, and who it is visible to.">
        {/* Where it lives — Public by default, or one of the circles you host / spaces you run.
            Owned targets place instantly (no approval needed). */}
        <div className="space-y-1.5">
          {/* On EDIT the scope is fixed and renders as static text, so there is no control to point
              at and the label is a plain heading; on CREATE it names the select. */}
          <Label className="text-sm text-text" htmlFor={isEdit ? undefined : 'event-scope'}>
            Where does it live? {!isEdit && <span className="text-danger">*</span>}
          </Label>
          {isEdit ? (
            <p className="rounded-lg border border-border bg-surface-elevated/40 px-3 py-2 text-sm text-muted">
              {currentScopeName ?? 'This event'}
            </p>
          ) : (
            <>
              <select
                id="event-scope"
                value={scopeId}
                onChange={(e) => {
                  const next = e.target.value
                  setScopeId(next)
                  // Moving off a circle removes the "My circle" option below — step the held
                  // value down to unlisted (never public), mirroring the server rule.
                  if (
                    (next === PUBLIC_SCOPE || next.startsWith(SPACE_PREFIX)) &&
                    visibility === 'circle_only'
                  ) {
                    setVisibility('unlisted')
                  }
                }}
                required
                disabled={isPending}
                className={fieldClasses}
              >
                <option value={PUBLIC_SCOPE}>Public · a local event</option>
                {circleOptions.length > 0 && (
                  <optgroup label="Circles you host">
                    {circleOptions.map((g) => (
                      <option key={g.id} value={g.id}>
                        In {g.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {spaceOptions.length > 0 && (
                  <optgroup label="Spaces you run">
                    {spaceOptions.map((g) => (
                      <option key={g.id} value={`${SPACE_PREFIX}${g.id}`}>
                        In {g.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p className="mt-1.5 text-2xs text-muted">
                {scopeId === PUBLIC_SCOPE
                  ? 'A standalone event in your area, open to anyone nearby.'
                  : 'It goes live here right away, since you run it.'}
              </p>
            </>
          )}
        </div>

        {/* Part of a Journey — an association, not a placement. Offered on create AND edit (unlike
            the scope, which is fixed once the event exists), because a Journey link can be made and
            undone at any time without moving the event. */}
        {showJourneyField && (
          <div className="space-y-1.5">
            <Label className="text-sm text-text" htmlFor="event-journey">Part of a Journey?</Label>
            <select
              id="event-journey"
              value={journeyId}
              onChange={(e) => setJourneyId(e.target.value)}
              disabled={isPending}
              className={fieldClasses}
            >
              <option value="">Not part of a Journey</option>
              {journeyOptions.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-2xs text-muted">
              Optional. This does not move the event. It stays where it lives above.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-sm text-text" htmlFor="event-visibility">Who can see this?</Label>
          <select id="event-visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            disabled={isPending}
            className={fieldClasses}
          >
            {visibilityOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-2xs text-muted">
            Public events can show up in local discovery. Unlisted stays link-only.
          </p>
        </div>
      </FormSection>

      {/* ── Extras ────────────────────────────────────────────────────────── */}
      <FormSection title="Extras" hint="Price, size, vibe, and the practical notes. All optional.">
        {/* A tidy two-column function layout: price, group size, energy, and the special
            instructions box arranged across two columns (single column on mobile). */}
        <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
          {/* Price — free RSVP or a set ticket price (events.price_cents). */}
          <div className="space-y-1.5">
            <Label className="text-sm text-text" id="event-price-label">Price</Label>
            <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="event-price-label">
              {([
                { value: 'free' as const, label: 'Free' },
                { value: 'paid' as const, label: 'Set a price' },
              ]).map(({ value, label }) => {
                const active = priceMode === value
                return (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setPriceMode(value)}
                    disabled={isPending}
                    className={`rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors ${
                      active
                        ? 'border-primary bg-primary-bg text-primary-strong ring-2 ring-primary/30'
                        : 'border-border bg-surface text-text hover:border-border-strong'
                    } disabled:opacity-60`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            {priceMode === 'paid' && (
              <div className="relative mt-2">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                  $
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={priceAmount}
                  onChange={(e) => setPriceAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={isPending}
                  className="pl-7"
                />
              </div>
            )}
            {/* SETTING A PRICE IS NOT GATED (ADR-914). Any account can sell; what the paid tiers buy is
                a lower rate, not the permission. The one thing still required is a payout account,
                because Stripe will not move money to an unverified one, and that is a banking fact
                rather than a tier. So this reads as a SETUP STEP with somewhere to go, never as a
                refusal: production has zero completed onboardings today precisely because the funnel
                is open and nothing ever asks. */}
            <p className="mt-1.5 text-2xs leading-relaxed text-muted">
              {priceMode === 'paid' ? (
                <>
                  Sets a ticket price. To take the money you need a payout account.{' '}
                  <Link href="/settings/billing" className="font-medium text-primary underline-offset-2 hover:underline">
                    Set that up
                  </Link>{' '}
                  in about two minutes, before or after you publish.
                </>
              ) : (
                'A free event people RSVP to. Switch to a price to sell tickets.'
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-text" htmlFor="event-capacity">
              Group size <span className="text-2xs font-normal text-subtle">(optional)</span>
            </Label>
            <Input id="event-capacity"
              type="number"
              inputMode="numeric"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="Cap the group size"
              disabled={isPending}
            />
            <p className="mt-1.5 text-2xs text-muted">Leave blank for unlimited.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-text" htmlFor="event-energy">
              Energy <span className="text-2xs font-normal text-subtle">(optional)</span>
            </Label>
            <select id="event-energy"
              value={energyTag}
              onChange={(e) => setEnergyTag(e.target.value)}
              disabled={isPending}
              className={fieldClasses}
            >
              {ENERGY_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-2xs text-muted">
              Whether it calms people down or fires them up. Helps us suggest it to the right people.
            </p>
          </div>

          {/* Special instructions — practical notes for attendees. */}
          <div className="space-y-1.5">
            <Label className="text-sm text-text" htmlFor="event-special-instructions">
              Special instructions <span className="text-2xs font-normal text-subtle">(optional)</span>
            </Label>
            <Textarea id="event-special-instructions"
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="Parking, what to bring, door code, accessibility notes…"
              rows={3}
              disabled={isPending}
              className="resize-none leading-relaxed"
            />
            <p className="mt-1.5 text-2xs text-muted">
              The practical details attendees need on the day.
            </p>
          </div>
        </div>
      </FormSection>

      {submitError && (
        <p className="rounded-lg border border-danger/40 bg-danger-bg/40 px-3 py-2 text-sm text-danger">
          {submitError}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-6">
        <button
          type="submit"
          disabled={!title.trim() || !scopeId || !startsAt || !!recurrenceError || isPending}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create Event'}
        </button>
        <Link
          href={backHref ?? '/events'}
          className="text-sm text-muted transition-colors hover:text-text"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
