// ─────────────────────────────────────────────────────────────────────────────
// THE JOURNEY RAIL'S PLAN (ADR-450 §2 · ADR-1240 · ADR-1246 · HYG-050).
//
// The Journey settings module used to mount the 700-line JourneySettings editor whole: six hand-drawn
// sections, each control with its own label, its own kind, and its own order, beside a manifest that
// declared the same fields with different words and three the rail persisted without declaring at all
// (the logo and the two header-overlay columns). Nothing compared the two. Now the module renders THIS,
// and this is JOURNEY_MANIFEST filtered through the kernel's edit plan.
//
// What this file says for itself is the SAVE PATHS and the shape each one takes. The Journey's actions
// are JSON-argument actions, not FormData ones, and each takes its own patch with its own key names
// (`coverImage` for the `cover_image` column, `dailyMinutes` for `daily_minutes`), so beside each zone's
// `writes` sits the column-to-key map ADR-1240 said every converted rail would need. Those maps restate
// the actions' own signatures once, where a test can hold them against the manifest. Everything a field
// IS, its label, its kind, its options, whether it is required, and where it falls in the order, is the
// manifest's, read through `railForm()`.
//
// THE ZONES are the rail's save paths:
//   identity    saveJourneyMeta         the name and the promise, hosted from the inline plane
//   header      saveJourneyMeta         the cover and logo (self-saving Loom picks) + the overlay
//   delivery    setJourneyRewards + setJourneyDelivery   one manifest section, two actions
//   visibility  setJourneyVisibility    its own flow: publish, moderation state, Vera's rank gate
//   attributes  setJourneyAttributes    discovery
//   meeting     setJourneyMeeting       both touchpoints, one jsonb column
//
// HOSTING THE INLINE PLANE. The manifest places `title` and `summary` on the inline canvas, and that is
// right: they are the content of the page. No inline canvas exists on /journeys/[slug] yet, so the rail
// hosts them (`hostInline`). Dropping that flag is the whole change when the canvas lands. `intro` is
// inline too and is NOT written here: it sits above the curriculum in the full editor (ADR-302).
//
// NOT A FIELD: `cover_focus`, the cover's focal point. It rides on the cover control (HeaderImageField)
// and is written by setJourneyHeaderFocus; it has no field kind because nobody fills it in.
//
// PURE: the manifest, the kernel, and the dependency-free meeting shape. The module and its test both
// import this, so the test pins what the rail renders without mounting a client module that reaches
// server actions.
// ─────────────────────────────────────────────────────────────────────────────

import { JOURNEY_MANIFEST } from '@/lib/studio/entities/journey'
import { railForm, type RailForm } from '@/lib/studio/kernel/edit-plan'
import type { FieldDef } from '@/lib/studio/kernel/manifest'
import type { JourneyMeeting, JourneyTouchpoint } from '@/lib/journeys/meeting'

/** The columns `saveJourneyMeta` writes from the identity form. */
export const JOURNEY_IDENTITY_WRITES = ['title', 'summary'] as const

/** The columns `saveJourneyMeta` writes from the header zone. */
export const JOURNEY_HEADER_WRITES = ['cover_image', 'logo_image', 'header_overlay_style', 'header_overlay_color'] as const

/** The columns `setJourneyRewards` (the first) and `setJourneyDelivery` (the other two) write. */
export const JOURNEY_DELIVERY_WRITES = ['completion_gems', 'drip_interval_days', 'certificate_enabled'] as const

/** The column `setJourneyVisibility` writes. (`status` is set by that action, never by the author.) */
export const JOURNEY_VISIBILITY_WRITES = ['visibility'] as const

/** The columns `setJourneyAttributes` writes. */
export const JOURNEY_ATTRIBUTE_WRITES = ['difficulty', 'category', 'tags', 'daily_minutes', 'enroll_cap'] as const

/** The paths `setJourneyMeeting` writes into the one `meeting` jsonb column: both touchpoints. */
const TOUCHPOINT_KEYS = ['format', 'schedule', 'timezone', 'location', 'link', 'notes', 'eventId'] as const
export const JOURNEY_MEETING_WRITES = [
  ...TOUCHPOINT_KEYS.map((k) => `meeting.${k}`),
  ...TOUCHPOINT_KEYS.map((k) => `meeting.gathering.${k}`),
] as readonly string[]

export interface JourneyRailPlan {
  identity: RailForm
  header: RailForm
  delivery: RailForm
  visibility: RailForm
  attributes: RailForm
  meeting: RailForm
}

export const JOURNEY_RAIL: JourneyRailPlan = {
  identity: railForm(JOURNEY_MANIFEST, JOURNEY_IDENTITY_WRITES, { hostInline: true }),
  header: railForm(JOURNEY_MANIFEST, JOURNEY_HEADER_WRITES),
  delivery: railForm(JOURNEY_MANIFEST, JOURNEY_DELIVERY_WRITES),
  visibility: railForm(JOURNEY_MANIFEST, JOURNEY_VISIBILITY_WRITES),
  attributes: railForm(JOURNEY_MANIFEST, JOURNEY_ATTRIBUTE_WRITES),
  meeting: railForm(JOURNEY_MANIFEST, JOURNEY_MEETING_WRITES),
}

/** Every field the rail renders, in manifest order, across all zones. */
export function journeyRailFields(): FieldDef[] {
  const paths = new Set(Object.values(JOURNEY_RAIL).flatMap((z) => z.fields.map((f) => f.path)))
  return JOURNEY_MANIFEST.fields.filter((f) => paths.has(f.path))
}

// ── Reading the row into the rail's values ───────────────────────────────────────────────

/** The rail's values: one display string per manifest path. Absent reads as empty. */
export type JourneyRailValues = Record<string, string>

/** Walk a dotted path off a record. Mirrors the kernel's own reader. PURE. */
function at(scope: Record<string, unknown>, path: string): unknown {
  let cur: unknown = scope
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

/** Render a stored value as the control's string. A list (tags) joins the way the kit splits it. */
function display(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return v.map(String).join(', ')
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/**
 * The rail's initial values from a `journey_plans` row (columns keyed as the manifest paths them, with
 * `meeting` already normalized). A field with a `read` uses it, so the manifest's own defaults (30 Gems,
 * a 7 day drip, Shade, Just me) are what an unset column shows; everything else reads the scalar.
 */
export function journeyRailValues(row: Record<string, unknown>): JourneyRailValues {
  const out: JourneyRailValues = {}
  for (const f of journeyRailFields()) out[f.path] = f.read ? f.read(row) : display(at(row, f.path))
  return out
}

// ── The column-to-key maps: one per JSON-argument action ─────────────────────────────────

/** `saveJourneyMeta`'s patch. Keys restate its signature; the values are the rail's. */
export interface JourneyMetaPatch {
  title?: string
  summary?: string | null
  coverImage?: string | null
  logoImage?: string | null
  headerOverlayStyle?: string | null
  headerOverlayColor?: string | null
}

const META_KEYS: Record<
  (typeof JOURNEY_IDENTITY_WRITES)[number] | (typeof JOURNEY_HEADER_WRITES)[number],
  keyof JourneyMetaPatch
> = {
  title: 'title',
  summary: 'summary',
  cover_image: 'coverImage',
  logo_image: 'logoImage',
  header_overlay_style: 'headerOverlayStyle',
  header_overlay_color: 'headerOverlayColor',
}

/** The meta patch for ONE zone's columns, so the identity form and the header zone each send only theirs. */
export function journeyMetaPatch(values: JourneyRailValues, writes: readonly (keyof typeof META_KEYS)[]): JourneyMetaPatch {
  const patch: JourneyMetaPatch = {}
  for (const col of writes) {
    const v = values[col] ?? ''
    // The title is the one column updatePlan takes as a bare string; the rest are nullable.
    if (col === 'title') patch.title = v
    else patch[META_KEYS[col]] = v || null
  }
  return patch
}

/** `setJourneyRewards`' one argument. An emptied box is 0 Gems; updatePlan clamps to 0-100. */
export function journeyRewards(values: JourneyRailValues): number {
  return Number(values.completion_gems) || 0
}

/** `setJourneyDelivery`'s patch. An emptied drip is 0; updatePlan clamps to 1-30. */
export function journeyDeliveryPatch(values: JourneyRailValues): { certificateEnabled: boolean; dripIntervalDays: number } {
  return {
    certificateEnabled: values.certificate_enabled === 'true',
    dripIntervalDays: Number(values.drip_interval_days) || 0,
  }
}

/** `setJourneyAttributes`' patch. Empty reads as null (unset), the way the old pills and boxes sent it. */
export function journeyAttributesPatch(values: JourneyRailValues): {
  difficulty: string | null
  category: string | null
  tags: string[]
  dailyMinutes: number | null
  enrollCap: number | null
} {
  return {
    difficulty: values.difficulty || null,
    category: values.category || null,
    tags: (values.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    dailyMinutes: Number(values.daily_minutes) || null,
    enrollCap: Number(values.enroll_cap) || null,
  }
}

const FORMATS = new Set<JourneyTouchpoint['format']>(['virtual', 'in_person', 'hybrid'])

function touchpoint(values: JourneyRailValues, prefix: string): JourneyTouchpoint {
  const s = (k: string) => values[`${prefix}.${k}`] || null
  const format = s('format') as JourneyTouchpoint['format']
  return {
    format: FORMATS.has(format) ? format : null,
    schedule: s('schedule'),
    timezone: s('timezone'),
    location: s('location'),
    link: s('link'),
    notes: s('notes'),
    eventId: s('eventId'),
  }
}

/** `setJourneyMeeting`'s one argument: both touchpoints. The action re-normalizes, and an all-null
 *  Gathering is stored as null there, so the rail never has to decide when a Gathering "exists". */
export function journeyMeetingPatch(values: JourneyRailValues): JourneyMeeting {
  return { ...touchpoint(values, 'meeting'), gathering: touchpoint(values, 'meeting.gathering') }
}
