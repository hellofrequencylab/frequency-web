'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createEvent, updateEvent } from '@/app/(main)/events/actions'
import { isError } from '@/lib/action-result'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'
import { ImageUpload } from '@/components/ui/image-upload'
import { MultiImageUpload } from '@/components/ui/multi-image-upload'
import { EventLocationMap } from '@/components/events/event-location-map'

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

type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly'
type PriceMode = 'free' | 'paid'

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string; helper: string }[] = [
  { value: 'none',    label: 'One-time',  helper: 'Happens once'                          },
  { value: 'daily',   label: 'Every day', helper: 'Same time each day'                    },
  { value: 'weekly',  label: 'Weekly',    helper: 'Same day & time each week'             },
  { value: 'monthly', label: 'Monthly',   helper: 'Same date each month'                  },
]

// Friendly Title Case labels — what the event *is*, no jargon.
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'gathering',       label: 'Gathering'        },
  { value: 'ceremony',        label: 'Ceremony'         },
  { value: 'movement',        label: 'Movement'         },
  { value: 'circle_ritual',   label: 'Circle Ritual'    },
  { value: 'learning',        label: 'Learning'         },
  { value: 'social',          label: 'Social'           },
  { value: 'service',         label: 'Service'          },
  { value: 'external_meetup', label: 'External Meetup'  },
  { value: 'retreat',         label: 'Retreat'          },
  { value: 'online',          label: 'Online'           },
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
  /** The event's stored venue point (edit mode) — renders a map preview when present. */
  venueLat?: number
  venueLng?: number
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
  initial,
  eventId,
  currentScopeName,
  backHref,
  defaultGroupId,
}: {
  groups: Group[]
  /** When set (with `eventId`), the form prefills and edits the event. */
  initial?: Partial<EventFormInitial>
  /** When set, the form edits this event via updateEvent instead of createEvent. */
  eventId?: string
  /** In edit mode, where the event lives now (the scope can't be changed here). */
  currentScopeName?: string
  /** Where the Cancel link returns to (defaults to /events). */
  backHref?: string
  /** Pre-selected scope on create (from the `?circle=` deep link, already validated to one
   *  of the caller's own hosted circles by the page). */
  defaultGroupId?: string
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
  // Default to PUBLIC on create (any member can post a local event); a circle/space is opt-in.
  // A deep-link circle or a Duplicate prefill wins when present.
  const [scopeId, setScopeId] = useState(initial?.scopeId ?? defaultGroupId ?? PUBLIC_SCOPE)
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
  // invalid combination (e.g. circle_only on a public event) so this can never save a bad pair.
  const [visibility, setVisibility] = useState(initial?.visibility ?? (isEdit ? 'circle_only' : 'public'))
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

  // Split the scope options into their two optgroups (circles you host / spaces you run).
  const circleOptions = useMemo(() => groups.filter((g) => g.kind !== 'space'), [groups])
  const spaceOptions = useMemo(() => groups.filter((g) => g.kind === 'space'), [groups])

  // The saved venue point (edit mode only) drives the map preview. On create there is no
  // geocoded point yet, so we show a short note instead (the pin lands after save).
  const venuePoint =
    typeof initial?.venueLat === 'number' && typeof initial?.venueLng === 'number'
      ? { lat: initial.venueLat, lng: initial.venueLng }
      : null
  const hasAddressInput =
    attendanceMode !== 'online' &&
    [venueName, street, city, region, postalCode, country, location].some((v) => v.trim().length > 0)

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

    // Price. A free event sends NO price field: createEvent reads that as null, and updateEvent
    // leaves price_cents untouched (so a blank never wipes a price the read-only-scope edit page
    // does not round-trip). A set price sends whole cents.
    if (priceMode === 'paid') {
      const cents = Math.round(parseFloat(priceAmount.replace(/[^0-9.]/g, '')) * 100)
      if (Number.isFinite(cents) && cents > 0) fd.set('priceCents', String(cents))
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
    }

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
        <div className="space-y-1.5">
          <Label className="text-sm text-text">
            Event title <span className="text-danger">*</span>
          </Label>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Wednesday Morning Ride"
            required
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm text-text">What kind of gathering is this?</Label>
          <select
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

        {/* Gallery — additional photos. The cover above leads the gallery on the event page. */}
        <MultiImageUpload
          label="More photos"
          value={galleryImagePaths}
          onChange={setGalleryImagePaths}
          folder="event-gallery"
          hint="Optional. Extra photos shown in a gallery below the poster."
          disabled={isPending}
        />

        <div className="space-y-1.5">
          <Label className="text-sm text-text">
            Description <span className="text-2xs font-normal text-subtle">(optional)</span>
          </Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details, what to bring, meetup point…"
            rows={4}
            disabled={isPending}
            className="resize-none leading-relaxed"
          />
        </div>
      </FormSection>

      {/* ── When ──────────────────────────────────────────────────────────── */}
      <FormSection title="When" hint="The start time is the one thing people plan around.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm text-text">
              Starts at <span className="text-danger">*</span>
            </Label>
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-text">
              Ends at <span className="text-2xs font-normal text-subtle">(optional)</span>
            </Label>
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              // Seed the empty picker on the start day (today on create), never a past default.
              min={startsAt || `${localToday()}T00:00`}
              disabled={isPending}
            />
          </div>
        </div>

        {/* Recurrence — set the cadence on create, change it on edit. */}
        <div className="space-y-1.5">
          <Label className="text-sm text-text">Repeats</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
              <Label className="text-text">
                Ends on <span className="text-subtle">(optional, leave blank for indefinite)</span>
              </Label>
              <Input
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
      </FormSection>

      {/* ── Where ─────────────────────────────────────────────────────────── */}
      <FormSection title="Where" hint="Add an address for in-person events so people nearby can find it on the map.">
        <div className="space-y-1.5">
          <Label className="text-sm text-text">How do people attend?</Label>
          <div className="grid grid-cols-3 gap-2">
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
            <Label className="text-sm text-text">
              Join link <span className="text-2xs font-normal text-subtle">(optional)</span>
            </Label>
            <Input
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
          <Label className="text-sm text-text">
            Location <span className="text-2xs font-normal text-subtle">(optional)</span>
          </Label>
          <Input
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
            blank to skip the map; the event still saves. */}
        {attendanceMode !== 'online' && (
          <div className="space-y-3 rounded-xl border border-border bg-surface-elevated/40 p-4">
            <div className="space-y-1">
              <Label className="text-sm text-text">
                Address <span className="text-2xs font-normal text-subtle">(optional, for the map)</span>
              </Label>
              <p className="text-2xs text-muted">
                Fill in what you have. We place the event on the map so people nearby can find it.
              </p>
            </div>
            <Input
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="Venue name"
              disabled={isPending}
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

            {/* Map: the saved venue point (edit mode) renders a live preview; on create there is
                no geocoded point yet, so show a short note once an address has been typed. */}
            {venuePoint ? (
              <EventLocationMap venuePoint={venuePoint} />
            ) : hasAddressInput ? (
              <p className="rounded-lg border border-border bg-surface px-3 py-2 text-2xs text-muted">
                We drop a pin from this address once you save, so it shows on the map for people
                nearby.
              </p>
            ) : null}
          </div>
        )}
      </FormSection>

      {/* ── Who can see it ────────────────────────────────────────────────── */}
      <FormSection title="Who can see it" hint="Where the event lives, and who it is visible to.">
        {/* Where it lives — Public by default, or one of the circles you host / spaces you run.
            Owned targets place instantly (no approval needed). */}
        <div className="space-y-1.5">
          <Label className="text-sm text-text">
            Where does it live? {!isEdit && <span className="text-danger">*</span>}
          </Label>
          {isEdit ? (
            <p className="rounded-lg border border-border bg-surface-elevated/40 px-3 py-2 text-sm text-muted">
              {currentScopeName ?? 'This event'}
            </p>
          ) : (
            <>
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
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

        <div className="space-y-1.5">
          <Label className="text-sm text-text">Who can see this?</Label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            disabled={isPending}
            className={fieldClasses}
          >
            {VISIBILITY_OPTIONS.map(({ value, label }) => (
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
      <FormSection title="Extras" hint="Price, size, and the vibe. All optional.">
        {/* Price — free RSVP or a set ticket price (events.price_cents). */}
        <div className="space-y-1.5">
          <Label className="text-sm text-text">Price</Label>
          <div className="grid grid-cols-2 gap-2">
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
          <p className="mt-1.5 text-2xs text-muted">
            {priceMode === 'paid'
              ? 'Sets a ticket price. Guests can buy a seat once you turn on payouts.'
              : 'A free event people RSVP to. Switch to a price to sell tickets.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm text-text">
              Group size <span className="text-2xs font-normal text-subtle">(optional)</span>
            </Label>
            <Input
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
            <Label className="text-sm text-text">
              Energy <span className="text-2xs font-normal text-subtle">(optional)</span>
            </Label>
            <select
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
