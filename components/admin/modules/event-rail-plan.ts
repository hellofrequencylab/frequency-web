// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT RAIL'S PLAN (ADR-450 §2 · ADR-1240 · ADR-1246 · ADR-1281 · HYG-050).
//
// The Event settings module used to be a 790-line form that declared every field by hand: thirty
// controls, each with its own label, kind, options, and order, beside a manifest that declared
// twenty of them with different words (One time for Does not repeat, Group size for Capacity,
// Place for a hidden input) and did not declare the other ten at all (the join mode, the RSVP
// window, the approval, check-in, listing, and hidden-address switches, the permalink). Nothing
// compared the two. Now the module renders THIS, and this is EVENT_MANIFEST filtered through the
// kernel's edit plan.
//
// What this file says for itself is the SAVE PATHS, the TRANSLATION, and the COMPOSITES:
//   • the columns each save path writes (`*_WRITES`);
//   • the key the settings action reads each one under (`EVENT_COLUMNS`), because the manifest's
//     paths are camelCase, the action's FormData keys are snake_case, and two of them are not
//     columns at all (`price` arrives in dollars; the RSVP window arrives as two keys and lands
//     inside `events.details`), plus the readers that turn a row into the controls' strings;
//   • the six controls the rail hosts that are NOT fields (`EVENT_COMPOSITES`), named here so this
//     file is still the single account of what the rail shows. The pin (`lat` / `lng`) rides on the
//     map control and is not a field, as the Journey's cover focus is not (ADR-1246).
// Everything a field IS, its label, its kind, its options, whether it is required, and where it
// falls in the order, is the manifest's, read through `railForm()`.
//
// THE ZONES are the rail's save paths:
//   gallery     setEventGalleryImages      the ordered gallery whose first tile is the cover
//   settings    updateEventSettings        the autosave form, FormData keyed by the action's keys
//   placement   EventPlacementField's own actions (steward-approved), persisting `scopeId`
//   permalink   updateEventPermalink       its own action: a rename redirects the page
//
// HOSTING THE INLINE PLANE. The manifest places `title`, `description`, and the two image fields on
// the inline canvas (they are the content of the page). No inline canvas exists on /events/[slug]
// yet, so the rail hosts them (`hostInline`). Dropping that flag is the whole change when the canvas
// lands. `startsAt`, `location`, and `priceCents` are asked at creation and edited here after, which
// the manifest now says with `editPlane: 'rail'` (ADR-1281).
//
// PURE: the manifest, the kernel, and three import-free event helpers. The module and its test both
// import this, so the test pins what the rail renders without mounting a client module that reaches
// server actions.
// ─────────────────────────────────────────────────────────────────────────────

import { EVENT_MANIFEST } from '@/lib/studio/entities/event'
import { railForm, type RailForm } from '@/lib/studio/kernel/edit-plan'
import type { FieldDef, SectionDef } from '@/lib/studio/kernel/manifest'
import { isoToWallClockInput } from '@/lib/events/datetime'
import { formatRepeatDraft, repeatFor } from '@/lib/events/repeat-rule'
import { readEventCheckInEnabled } from '@/lib/events/checkin-enabled'
import { readEventMarketListed } from '@/lib/events/market-listing'

/** The columns `setEventGalleryImages` writes: the gallery, and the cover as its first tile. */
export const EVENT_GALLERY_WRITES = ['coverImagePath', 'galleryImagePaths'] as const

/** The columns `updateEventSettings` writes, as the action reads them off its FormData. */
export const EVENT_SETTINGS_WRITES = [
  'title',
  'category',
  'description',
  'startsAt',
  'endsAt',
  'recurrenceRule',
  'timeZone',
  'location',
  'attendanceMode',
  'onlineUrl',
  'venueName',
  'street',
  'city',
  'region',
  'postalCode',
  'country',
  'hideAddress',
  'priceCents',
  'joinMode',
  'details.rsvpWindow.opensAt',
  'details.rsvpWindow.closesAt',
  'visibility',
  'capacity',
  'energyTag',
  'rsvpRequiresApproval',
  'checkInEnabled',
  'marketListed',
] as const

/** The column `EventPlacementField`'s actions persist (with `scope_type` derived beside it). */
export const EVENT_PLACEMENT_WRITES = ['scopeId'] as const

/** The column `updateEventPermalink` writes. */
export const EVENT_PERMALINK_WRITES = ['slug'] as const

export type EventSettingsPath = (typeof EVENT_SETTINGS_WRITES)[number]
export type EventRailPath =
  | (typeof EVENT_GALLERY_WRITES)[number]
  | EventSettingsPath
  | (typeof EVENT_PLACEMENT_WRITES)[number]
  | (typeof EVENT_PERMALINK_WRITES)[number]

/**
 * THE COLUMN-TO-PATH MAP. For the settings zone this is the FormData KEY `updateEventSettings`
 * reads, which is the column's name except where the action takes a different shape: `price` is
 * whole currency units the action converts to `price_cents`, and the RSVP window is two keys the
 * action folds into `details.rsvpWindow`. For the other zones it is the column their action writes.
 */
export const EVENT_COLUMNS: Record<EventRailPath, string> = {
  coverImagePath: 'cover_image_path',
  galleryImagePaths: 'gallery_image_paths',
  title: 'title',
  category: 'category',
  description: 'description',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  // ONE key for the whole Repeats question (ADR-1299). The action derives `recurrence_type` and
  // splits `recurrence_until` back out of the posted rule, so neither is a form key any more.
  recurrenceRule: 'recurrence_rule',
  timeZone: 'time_zone',
  location: 'location',
  attendanceMode: 'attendance_mode',
  onlineUrl: 'online_url',
  venueName: 'venue_name',
  street: 'street',
  city: 'city',
  region: 'region',
  postalCode: 'postal_code',
  country: 'country',
  hideAddress: 'hide_address',
  priceCents: 'price',
  joinMode: 'join_mode',
  'details.rsvpWindow.opensAt': 'rsvp_opens_at',
  'details.rsvpWindow.closesAt': 'rsvp_closes_at',
  visibility: 'visibility',
  capacity: 'capacity',
  energyTag: 'energy_tag',
  rsvpRequiresApproval: 'rsvp_requires_approval',
  checkInEnabled: 'checkin_enabled',
  marketListed: 'market_listed',
  scopeId: 'scope_id',
  slug: 'slug',
}

/** The two keys the settings action reads for the map pin. NOT fields: the pin is dragged on the
 *  map control, nobody types it, and no field kind fits a coordinate pair. */
export const EVENT_PIN_KEYS = ['lat', 'lng'] as const

export interface EventRailPlan {
  gallery: RailForm
  settings: RailForm
  placement: RailForm
  permalink: RailForm
}

export const EVENT_RAIL: EventRailPlan = {
  gallery: railForm(EVENT_MANIFEST, EVENT_GALLERY_WRITES, { hostInline: true }),
  settings: railForm(EVENT_MANIFEST, EVENT_SETTINGS_WRITES, { hostInline: true }),
  placement: railForm(EVENT_MANIFEST, EVENT_PLACEMENT_WRITES),
  permalink: railForm(EVENT_MANIFEST, EVENT_PERMALINK_WRITES),
}

// ── The composites: what the rail hosts that is not a field ─────────────────────────────

/**
 * The controls the module renders beside the plan's fields, each named once so the plan stays the
 * single account of the rail. `section` is the manifest section it renders under, which the test
 * holds against the manifest. None of them declares a field: each is a control over a zone above,
 * a control whose value is not a field, or an action on another table.
 */
export const EVENT_COMPOSITES = [
  // The ordered gallery, the Loom picker, the scanned-poster shortcut, and the header controls
  // (focus, aspect, height ride on the cover control). Persists the gallery zone.
  { key: 'gallery', section: 'identity' },
  // A live venue search that fills the address fields, the one-line place, and the pin. Writes
  // nothing of its own: every value it produces lands in a field or on the pin.
  { key: 'venueSearch', section: 'where' },
  // The draggable map pin. `lat` / `lng` ride on it (EVENT_PIN_KEYS) and are not fields.
  { key: 'mapPin', section: 'where' },
  // Invite a co-host: its own actions on `event_cohosts`, no column of this manifest.
  { key: 'cohosts', section: 'host' },
  // Where the event lives, steward-approved: persists the placement zone (`scopeId`).
  { key: 'placement', section: 'settings' },
  // Share onto another Space's calendar: its own actions on `event_shares`, no column here.
  { key: 'share', section: 'settings' },
] as const

export type EventComposite = (typeof EVENT_COMPOSITES)[number]['key']

// ── The settings zone, grouped by manifest section ────────────────────────────────────────

export interface EventSettingsGroup {
  section: SectionDef
  fields: FieldDef[]
}

/** The settings zone's fields grouped by manifest section, in manifest order, with each section's
 *  own title and line. The module heads each group with them, as the Journey's touchpoints are. */
export function eventSettingsGroups(): EventSettingsGroup[] {
  return EVENT_MANIFEST.sections
    .map((section) => ({ section, fields: EVENT_RAIL.settings.fields.filter((f) => f.section === section.key) }))
    .filter((g) => g.fields.length > 0)
}

/**
 * "My circle" is only offered when the event's home IS a Circle. On any other scope the server steps
 * it down to unlisted (coerceVisibilityForScope, ADR-883), so offering it would offer a dead choice.
 * The manifest declares the closed set; this is the surface narrowing it to the scope it knows, the
 * way a loaded collection is the surface's. PURE: a derived field, the manifest untouched.
 */
export function eventVisibilityField(def: FieldDef, scopeType: string | null | undefined): FieldDef {
  if (scopeType === 'circle' || !def.options) return def
  return { ...def, options: def.options.filter((o) => o.value !== 'circle_only') }
}

// ── Reading the row into the rail's values ───────────────────────────────────────────────

/** The rail's values: one control string per manifest path. Absent reads as empty. */
export type EventRailValues = Record<string, string>

/** What `getEventAdminData` returns, as far as the readers below need it: the `events` columns by
 *  name, plus the RSVP window it lifts out of `details` and the theme bag. */
export type EventRailRow = Record<string, unknown> & {
  theme?: unknown
  scope_type?: string | null
  rsvpOpensAt?: string | null
  rsvpClosesAt?: string | null
}

/** A stored ISO instant → the `YYYY-MM-DD` a `<input type="date">` wants (UTC parts). */
export function isoToDateInput(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * The repeat picker's transport string for a stored row: the rule it carries (or the one its legacy
 * cadence means, resolved against its start) plus the stored `recurrence_until` as an `UNTIL=` part.
 *
 * 🔴 THE JOIN HAPPENS HERE, ON THE WAY IN, because the control is ONE control. The two values live
 * in two columns for good reasons (ADR-807 pins the end to a real timestamptz the occurrence cron
 * filters on), and the picker owns both halves of the question, so something has to speak both
 * dialects. It is this reader and its mirror in `updateEventSettings`, and nothing else.
 */
function repeatDraftFor(row: EventRailRow): string {
  const rule = repeatFor({
    starts_at: str(row.starts_at) || null,
    recurrence_type: str(row.recurrence_type) || null,
    recurrence_rule: str(row.recurrence_rule) || null,
  })
  if (!rule) return ''
  return formatRepeatDraft(rule, isoToDateInput(row.recurrence_until) || null)
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const bool = (v: unknown) => String(v === true)

/**
 * The paths whose control string is not the column read plainly. Each is the settings action's own
 * shape read backwards: a wall-clock input from a stored instant, dollars from cents, a checkbox from
 * a boolean or a theme-bag switch, and the ADR-883 step-down for visibility on a non-Circle scope.
 */
const READERS: Partial<Record<EventSettingsPath, (row: EventRailRow) => string>> = {
  startsAt: (r) => isoToWallClockInput(str(r.starts_at)),
  endsAt: (r) => isoToWallClockInput(str(r.ends_at)),
  // The picker speaks ONE transport string: the stored rule plus the stored end as `UNTIL=`.
  recurrenceRule: (r) => repeatDraftFor(r),
  'details.rsvpWindow.opensAt': (r) => isoToWallClockInput(r.rsvpOpensAt),
  'details.rsvpWindow.closesAt': (r) => isoToWallClockInput(r.rsvpClosesAt),
  priceCents: (r) => (typeof r.price_cents === 'number' && r.price_cents > 0 ? String(r.price_cents / 100) : ''),
  hideAddress: (r) => bool(r.hide_address),
  rsvpRequiresApproval: (r) => bool(r.rsvp_requires_approval),
  checkInEnabled: (r) => String(readEventCheckInEnabled(r.theme)),
  marketListed: (r) => String(readEventMarketListed(r.theme)),
  visibility: (r) => {
    const v = str(r.visibility)
    if (r.scope_type === 'circle') return v || 'circle_only'
    return v === 'circle_only' || !v ? 'unlisted' : v
  },
}

/** Render a stored value as the control's string. */
function display(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/**
 * The settings zone's initial values from the row `getEventAdminData` returns. A path with a reader
 * uses it; otherwise a field with a `read` uses that against a view keyed by manifest path, so the
 * manifest's own defaults (a gathering, one time, in person, HOME's zone, automatic joining) are what
 * an unset column shows; everything else reads the scalar under its column.
 */
export function eventRailValues(row: EventRailRow): EventRailValues {
  const view: Record<string, unknown> = {}
  for (const f of EVENT_RAIL.settings.fields) view[f.path] = row[EVENT_COLUMNS[f.path as EventRailPath]]
  const out: EventRailValues = {}
  for (const f of EVENT_RAIL.settings.fields) {
    const path = f.path as EventSettingsPath
    const reader = READERS[path]
    out[path] = reader ? reader(row) : f.read ? f.read(view) : display(view[path])
  }
  return out
}

// ── The settings form's FormData, keyed the way the action reads it ──────────────────────

export interface EventPin {
  lat: number | null
  lng: number | null
}

/**
 * `updateEventSettings`' FormData from the rail's values and the pin: every settings key, plus
 * `lat` / `lng`. Built from the values rather than snapshotted off the form because a native
 * checkbox is ABSENT from a FormData when unchecked, and the action writes each switch only when its
 * key is present (`'on'` / `'off'`), so a snapshot could never switch one OFF. The old rail carried a
 * controlled hidden input per switch for the same reason; the plan encodes it once, here.
 */
export function eventSettingsFormData(values: EventRailValues, pin: EventPin): FormData {
  const fd = new FormData()
  for (const f of EVENT_RAIL.settings.fields) {
    const path = f.path as EventSettingsPath
    const v = values[path] ?? ''
    fd.set(EVENT_COLUMNS[path], f.kind === 'toggle' ? (v === 'true' ? 'on' : 'off') : v)
  }
  fd.set('lat', pin.lat == null ? '' : String(pin.lat))
  fd.set('lng', pin.lng == null ? '' : String(pin.lng))
  return fd
}
