// Pure helpers for the Poster Events extraction — no I/O, fully unit-tested. This
// is the trust boundary for AI output: coerceEventExtraction() turns arbitrary
// model JSON (vision scan or text assist) into a safe, fully-populated
// ExtractedEvent. Keeping it pure means we can test the harvest without a live
// model. Mirrors lib/connections/normalize.ts (coerceExtraction).
//
// Every reader here is a zod schema plus a mapper (PROG-E8C, the ADR-1287 pattern, lib/ai/schema.ts): the schema says
// what each raw field may be and what a wrong one reads as, the mapper builds the stored shape. Nothing walks the raw
// value by hand, and nothing here throws.

import type {
  ExtractedEvent,
  ImageBox,
  DomainSlug,
  CornerPoint,
  CaptureQuality,
  EventDetails,
  LineupItem,
  ScheduleItem,
  TicketTier,
  EventLink,
  ImageRegion,
  OtherDetail,
  FieldConfidence,
} from './types'
import { normalizeHttpUrl } from '@/lib/safe-url'
import { aliasedText, lenientList, looseEnum, looseNumber, noteList, rowsOrNone, shortText, textOrEmpty, unitBox, validateModelValue, z } from '@/lib/ai/schema'

const DOMAIN_SLUGS = ['mind', 'body', 'spirit', 'expression'] as const satisfies readonly DomainSlug[]

// A generous-but-finite window: an event date must land within this range or we
// drop it (a poster month/day with no year is resolved to a future occurrence by
// the model; this is the backstop against garbage like year 1900 or 3000).
const MIN_MS = Date.UTC(2000, 0, 1)
const MAX_MS = Date.UTC(2100, 0, 1)

/** Trim + length-cap a value through the schema; '' when it is absent or not a string. */
function str(v: unknown, max: number): string {
  const res = validateModelValue(v, shortText(max))
  return res.ok ? res.data : ''
}

/** One tag: single-spaced, lowercased, leading '#' stripped, capped. */
const EVENT_TAG = z.string().transform((s) => s.trim().replace(/\s+/g, ' ').replace(/^#+/, '').trim().toLowerCase().slice(0, 40))

/** The tag list as sent: anything that is not a string is dropped; not a list is no tags. */
const EVENT_TAGS = lenientList(EVENT_TAG).catch(() => [])

/** Drop empties, dedupe (first spelling wins), cap count. */
function dedupeEventTags(tags: readonly string[], max = 6): string[] {
  const out: string[] = []
  for (const tag of tags) {
    if (!tag || out.includes(tag)) continue
    out.push(tag)
    if (out.length >= max) break
  }
  return out
}

const DOMAIN = looseEnum(DOMAIN_SLUGS)

/** Map an arbitrary model domain string → a known DomainSlug, or null. */
export function coerceDomain(raw: unknown): DomainSlug | null {
  const res = validateModelValue(raw, DOMAIN)
  return res.ok ? res.data : null
}

/** Clamp a model-provided box into the unit square; null if degenerate/missing. */
export function clampImageBox(raw: unknown): ImageBox | null {
  const res = validateModelValue(raw, unitBox)
  return res.ok ? res.data : null
}

/** An ISO-ish date string, parsed and held to the sane window; '' when empty, unparseable or out of range. */
const ISO_DATE = z.string().transform((raw) => {
  const s = raw.trim()
  if (!s) return ''
  const ms = Date.parse(s)
  if (!Number.isFinite(ms) || ms < MIN_MS || ms > MAX_MS) return ''
  return new Date(ms).toISOString()
})

/** Parse + sanity-clamp an ISO-ish date string. '' when missing or out of range. */
export function coerceIsoDate(raw: unknown): string {
  const res = validateModelValue(raw, ISO_DATE)
  return res.ok ? res.data : ''
}

/** A date under one of two keys (`startsAt` / `starts_at`): absent lets the other key answer, a wrong type is ''. */
const ALIASED_DATE = ISO_DATE.nullish().catch('')

/** The default "looks fine" capture quality used when the model says nothing. */
const DEFAULT_QUALITY: CaptureQuality = { legible: true, glare: false, skew: false, note: null }

/** A corner coordinate: a number (or numeric string) that is already within 0..1. Out of range is refused, not
 *  snapped, so one bad point rejects the whole quad. */
const UNIT_COORD = looseNumber.pipe(z.number().min(0).max(1)).transform((n) => Math.max(n, 0))
const CORNER = z.object({ x: UNIT_COORD, y: UNIT_COORD })
const CORNERS = z.tuple([CORNER, CORNER, CORNER, CORNER])

/**
 * Coerce the four poster corners. Keep them ONLY if all four are present and
 * every coordinate lands within 0..1; otherwise null (the UI then skips deskew).
 * Order is preserved: [top-left, top-right, bottom-right, bottom-left].
 */
export function coerceCorners(raw: unknown): [CornerPoint, CornerPoint, CornerPoint, CornerPoint] | null {
  const res = validateModelValue(raw, CORNERS)
  return res.ok ? res.data : null
}

/** The capture-quality read: legible unless the model says no, glare and skew only when it says yes. */
const QUALITY = z
  .object({ legible: z.boolean().catch(true), glare: z.boolean().catch(false), skew: z.boolean().catch(false), note: textOrEmpty(160) })
  .transform((q): CaptureQuality => ({ legible: q.legible, glare: q.glare, skew: q.skew, note: q.note || null }))

/** Coerce the capture-quality read; caps the retake note, defaults when absent. */
export function coerceQuality(raw: unknown): CaptureQuality {
  const res = validateModelValue(raw, QUALITY)
  return res.ok ? res.data : { ...DEFAULT_QUALITY }
}

/** 'high' | 'low' field confidence, or undefined when absent/unknown. */
const CONFIDENCE = looseEnum(['high', 'low'] as const satisfies readonly FieldConfidence[])
  .optional()
  .catch(undefined)

const LINEUP_ROLES = ['band', 'speaker', 'dj', 'performer', 'host', 'other'] as const
const LINK_KINDS = ['tickets', 'rsvp', 'website', 'instagram', 'other'] as const
const REGION_KINDS = ['logo', 'photo', 'art'] as const

/** A found / box / imageIndex region (the event cover; a card's photo and logo share the shape). Found when a usable
 *  box came back or the model said so; the index is a whole number from 0. Anything else is "not found, image 0". */
export const foundRegion = z
  .object({
    box: unitBox,
    found: z.boolean().catch(false),
    imageIndex: z.number().transform((n) => (n >= 0 ? Math.floor(n) : 0)).catch(0),
  })
  .catch({ box: null, found: false, imageIndex: 0 })
  .transform((r) => ({ found: r.box !== null || r.found, box: r.box, imageIndex: r.imageIndex }))

/** The rich `details` harvest as sent. Each list is read row by row (a row that is not an object is dropped, a list
 *  that is not a list is empty) and each field has its own wrong-type reading. */
const DETAILS_REPLY = z.object({
  lineup: rowsOrNone(z.object({ name: textOrEmpty(120), role: looseEnum(LINEUP_ROLES).catch('other'), note: textOrEmpty(200), imageBox: unitBox, confidence: CONFIDENCE })),
  schedule: rowsOrNone(z.object({ title: textOrEmpty(160), time: textOrEmpty(60), note: textOrEmpty(200), confidence: CONFIDENCE })),
  features: noteList(16, 80).catch(() => []),
  tickets: rowsOrNone(
    z.object({
      label: textOrEmpty(120),
      // A non-negative whole number of cents, or null.
      priceCents: looseNumber.transform((n) => (n < 0 ? null : Math.round(n))).nullable().catch(null),
      note: textOrEmpty(200),
      confidence: CONFIDENCE,
    }),
  ),
  // A SAFE http/https url (scheme-less poster links default to https; javascript:/data: are dropped).
  links: rowsOrNone(z.object({ url: textOrEmpty(300).transform(normalizeHttpUrl), label: textOrEmpty(120), kind: looseEnum(LINK_KINDS).catch('other') })),
  sponsors: noteList(16, 120).catch(() => []),
  imageRegions: rowsOrNone(z.object({ box: unitBox, kind: looseEnum(REGION_KINDS).catch('photo'), note: textOrEmpty(200) })),
  other: rowsOrNone(z.object({ label: textOrEmpty(80), value: textOrEmpty(200) })),
  confidence: CONFIDENCE,
})

/** Build the stored details from a parsed reply: drop the rows missing their required part, cap each list, and leave
 *  out every empty key (so the JSONB column default stays clean). */
function toEventDetails(d: z.infer<typeof DETAILS_REPLY>): EventDetails {
  const out: EventDetails = {}

  // lineup (<=24): name required; role whitelisted; optional note/imageBox/confidence.
  const lineup = d.lineup
    .filter((r) => r.name)
    .slice(0, 24)
    .map((r) => {
      const item: LineupItem = { name: r.name, role: r.role }
      if (r.note) item.note = r.note
      if (r.imageBox) item.imageBox = r.imageBox
      if (r.confidence) item.confidence = r.confidence
      return item
    })
  if (lineup.length) out.lineup = lineup

  // schedule (<=24): title required; optional time/note/confidence.
  const schedule = d.schedule
    .filter((r) => r.title)
    .slice(0, 24)
    .map((r) => {
      const item: ScheduleItem = { title: r.title }
      if (r.time) item.time = r.time
      if (r.note) item.note = r.note
      if (r.confidence) item.confidence = r.confidence
      return item
    })
  if (schedule.length) out.schedule = schedule

  // features (<=16): plain strings.
  if (d.features.length) out.features = d.features

  // tickets (<=8): label required; priceCents non-negative int or null.
  const tickets = d.tickets
    .filter((r) => r.label)
    .slice(0, 8)
    .map((r) => {
      const item: TicketTier = { label: r.label }
      if (r.priceCents !== null) item.priceCents = r.priceCents
      if (r.note) item.note = r.note
      if (r.confidence) item.confidence = r.confidence
      return item
    })
  if (tickets.length) out.tickets = tickets

  // links (<=10): a safe url required; the label falls back to the url; kind whitelisted.
  const links = d.links.flatMap((r): EventLink[] => (r.url ? [{ label: r.label || r.url, url: r.url, kind: r.kind }] : [])).slice(0, 10)
  if (links.length) out.links = links

  // sponsors (<=16): plain strings.
  if (d.sponsors.length) out.sponsors = d.sponsors

  // imageRegions (<=12): a usable box required; kind whitelisted.
  const imageRegions = d.imageRegions
    .flatMap((r): ImageRegion[] => {
      if (!r.box) return []
      const item: ImageRegion = { box: r.box, kind: r.kind }
      if (r.note) item.note = r.note
      return [item]
    })
    .slice(0, 12)
  if (imageRegions.length) out.imageRegions = imageRegions

  // other (<=16): label + value pairs.
  const other = d.other
    .filter((r) => r.label && r.value)
    .slice(0, 16)
    .map((r): OtherDetail => ({ label: r.label, value: r.value }))
  if (other.length) out.other = other

  if (d.confidence) out.confidence = d.confidence

  return out
}

const EVENT_DETAILS = DETAILS_REPLY.transform(toEventDetails)

/**
 * Validate + length-cap the rich `details` harvest. Every nested field is
 * optional; we drop empty rows, clamp all boxes to 0..1, whitelist enums (unknown
 * -> 'other'/'photo'), coerce prices, and cap each array. Returns {} when there
 * is nothing worth persisting (so the JSONB column default stays clean).
 */
export function coerceEventDetails(raw: unknown): EventDetails {
  const res = validateModelValue(raw, EVENT_DETAILS)
  return res.ok ? res.data : {}
}

/** The save_event reply as sent (and the same shape from the text assist and the WhatsApp import). Every field has
 *  its own wrong-type reading, so the reply as a whole only fails when it is not an object at all. */
const EVENT_REPLY = z.object({
  title: textOrEmpty(160),
  // Capped where the event is built, below: its bound is the one the draft editor saves.
  description: z.unknown().optional(),
  startsAt: ALIASED_DATE,
  starts_at: ALIASED_DATE,
  endsAt: ALIASED_DATE,
  ends_at: ALIASED_DATE,
  location: textOrEmpty(240),
  isFree: z.boolean().catch(false),
  free: z.boolean().catch(false),
  // Whole cents above zero, sent as a number or a numeric string; anything else is "no price stated".
  priceCents: looseNumber.transform((n) => (n > 0 ? Math.round(n) : null)).nullable().catch(null),
  organizerName: aliasedText(160),
  organizer_name: aliasedText(160),
  organizerContact: aliasedText(200),
  organizer_contact: aliasedText(200),
  domain: DOMAIN.nullable().catch(null),
  tags: EVENT_TAGS,
  cover: foundRegion,
  corners: CORNERS.nullable().catch(null),
  quality: QUALITY.catch(() => ({ ...DEFAULT_QUALITY })),
  details: EVENT_DETAILS.catch(() => ({})),
})

/** What a reply that is not an object at all reads as: every field at its empty reading. */
const NO_EVENT = EVENT_REPLY.parse({})

/** Arbitrary model JSON → a safe, fully-populated ExtractedEvent. */
export function coerceEventExtraction(raw: unknown): ExtractedEvent {
  const res = validateModelValue(raw, EVENT_REPLY)
  const r = res.ok ? res.data : NO_EVENT

  // Free wins. No explicit price and not marked free: leave both unknown (treated as free by the UI's default, but
  // we do not assert it).
  const isFree = r.isFree || r.free
  const startsAt = r.startsAt ?? r.starts_at ?? ''
  let endsAt = r.endsAt ?? r.ends_at ?? ''
  // An end before the start is nonsense — drop it.
  if (startsAt && endsAt && Date.parse(endsAt) < Date.parse(startsAt)) endsAt = ''

  return {
    title: r.title,
    // The same bound the draft editor saves (updateEventDraft, 8000). A pasted write-up kept word
    // for word (the Spark's Exact / Edit choice) must survive the trip; a rewrite is short anyway.
    description: str(r.description, 8000),
    startsAt,
    endsAt,
    location: r.location,
    isFree,
    priceCents: isFree ? null : r.priceCents,
    organizerName: r.organizerName ?? r.organizer_name ?? '',
    organizerContact: r.organizerContact ?? r.organizer_contact ?? '',
    domain: r.domain,
    tags: dedupeEventTags(r.tags),
    cover: r.cover,
    corners: r.corners,
    quality: r.quality,
    details: r.details,
  }
}
