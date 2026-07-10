'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createEvent, updateEvent } from '@/app/(main)/events/actions'
import { isError } from '@/lib/action-result'
import { Input, Textarea, Label, fieldClasses } from '@/components/ui/field'
import { ImageUpload } from '@/components/ui/image-upload'
import { MultiImageUpload } from '@/components/ui/multi-image-upload'

// Today in the VIEWER's local timezone, as the `YYYY-MM-DD` a date/datetime-local
// input seeds with. Built from local parts (never `toISOString().slice`, which is
// UTC and would show "yesterday" for a viewer west of UTC late in the day).
function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

type Group = {
  id: string
  name: string
}

type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly'

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

// Default keeps the pre-P0 model: shared with your circle, nothing broadcast.
const VISIBILITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'circle_only', label: 'My circle'           },
  { value: 'public',      label: 'Anyone'              },
  { value: 'unlisted',    label: 'Anyone with the link' },
  { value: 'private',     label: 'Invite only'         },
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

// The prefill shape for edit mode — mirrors the form's own fields.
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
  /** In edit mode, the circle the event belongs to (the scope can't be changed here). */
  currentScopeName?: string
  /** Where the Cancel link returns to (defaults to /events). */
  backHref?: string
  /** Pre-selected scope on create (from the `?circle=` deep link, already validated to one
   *  of the caller's own circles by the page). Falls back to the first group. */
  defaultGroupId?: string
}) {
  const isEdit = !!eventId
  // Sentinel scope for a standalone PUBLIC event (any Crew member — no circle needed).
  // createEvent reads scopeType='public' and places it in the creator's region.
  const PUBLIC_SCOPE = '__public__'
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // A failed save surfaces HERE (the actions return ActionResult); the popup stays
  // open with the message instead of silently pretending success.
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [scopeId, setScopeId] = useState(
    initial?.scopeId ?? defaultGroupId ?? groups[0]?.id ?? (isEdit ? '' : PUBLIC_SCOPE),
  )
  // PART 2: on create, the date field defaults to the viewer's current (active) local
  // day at a sensible hour, so it is never blank or tz-shifted to yesterday. Edit keeps
  // the event's real stored time. `localToday()` is read once at mount (a stable seed).
  const [startsAt, setStartsAt] = useState(
    initial?.startsAt ?? (isEdit ? '' : `${localToday()}T18:00`),
  )
  const [endsAt, setEndsAt] = useState(initial?.endsAt ?? '')
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
    initial?.recurrenceType ?? 'none',
  )
  const [recurrenceUntil, setRecurrenceUntil] = useState(initial?.recurrenceUntil ?? '')
  const [capacity, setCapacity] = useState(initial?.capacity ?? '')
  const [visibility, setVisibility] = useState(
    initial?.visibility ?? (groups.length === 0 && !isEdit ? 'public' : 'circle_only'),
  )
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
    const isPublicScope = scopeId === PUBLIC_SCOPE
    fd.set('scopeType', isPublicScope ? 'public' : 'circle')
    fd.set('scopeId', isPublicScope ? '' : scopeId)
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
        // Keep the editor open and show what went wrong (mirrors the admin
        // EventEditClient's error surface) — never close on a failed save.
        setSubmitError(res.error)
        return
      }
      router.push(`/events/${res.data.slug}`)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Title */}
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

      {/* Where it lives — a public local event, or one of your circles. Any Crew member
          can create a public event; a circle option appears for each circle you're in. */}
      <div className="space-y-1.5">
        <Label className="text-sm text-text">
          Where does it live? {!isEdit && <span className="text-danger">*</span>}
        </Label>
        {isEdit ? (
          <p className="rounded-lg border border-border bg-surface-elevated/40 px-3 py-2 text-sm text-muted">
            {currentScopeName ?? 'This circle'}
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
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  In {g.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-2xs text-muted">
              {scopeId === PUBLIC_SCOPE
                ? 'A standalone event in your area, open to anyone nearby.'
                : 'Scoped to this circle.'}
            </p>
          </>
        )}
      </div>

      {/* Category */}
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

      {/* Start */}
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

      {/* End */}
      <div className="space-y-1.5">
        <Label className="text-sm text-text">
          Ends at <span className="text-2xs font-normal text-subtle">(optional)</span>
        </Label>
        <Input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          disabled={isPending}
        />
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
              min={startsAt.slice(0, 10) || undefined}
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

      {/* Location */}
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
      </div>

      {/* How people attend */}
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
        </div>
      )}

      {/* Structured address (in person / hybrid). Used to place the event on the
          map. Leave blank to skip the map; the event still saves. */}
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
        </div>
      )}

      {/* Capacity */}
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
          placeholder="Cap the group size so it stays intimate."
          disabled={isPending}
        />
        <p className="mt-1.5 text-2xs text-muted">Leave blank for unlimited.</p>
      </div>

      {/* Visibility */}
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
      </div>

      {/* Energy */}
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
          Whether the event tends to calm people down or fire them up. Used to suggest the right events to the right people.
        </p>
      </div>

      {/* Description */}
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

      {submitError && (
        <p className="rounded-lg border border-danger/40 bg-danger-bg/40 px-3 py-2 text-sm text-danger">
          {submitError}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
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
