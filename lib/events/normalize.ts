// Pure helpers for the Poster Events extraction — no I/O, fully unit-tested. This
// is the trust boundary for AI output: coerceEventExtraction() turns arbitrary
// model JSON (vision scan or text assist) into a safe, fully-populated
// ExtractedEvent. Keeping it pure means we can test the harvest without a live
// model. Mirrors lib/connections/normalize.ts (coerceExtraction).

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

const DOMAIN_SLUGS: DomainSlug[] = ['mind', 'body', 'spirit', 'expression']

// A generous-but-finite window: an event date must land within this range or we
// drop it (a poster month/day with no year is resolved to a future occurrence by
// the model; this is the backstop against garbage like year 1900 or 3000).
const MIN_MS = Date.UTC(2000, 0, 1)
const MAX_MS = Date.UTC(2100, 0, 1)

/** Trim + length-cap a possibly-non-string value; '' when absent. */
function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** One tag → trimmed, single-spaced, lowercased, leading-'#' stripped, capped. */
export function normalizeEventTag(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
  return s.replace(/^#+/, '').trim().toLowerCase().slice(0, 40)
}

/** Normalize, drop empties, dedupe (first spelling wins), cap count. */
export function dedupeEventTags(tags: unknown, max = 6): string[] {
  const arr = Array.isArray(tags) ? tags : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of arr) {
    const tag = normalizeEventTag(t)
    if (!tag) continue
    if (seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
    if (out.length >= max) break
  }
  return out
}

/** Map an arbitrary model domain string → a known DomainSlug, or null. */
export function coerceDomain(raw: unknown): DomainSlug | null {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return (DOMAIN_SLUGS as string[]).includes(s) ? (s as DomainSlug) : null
}

/** Clamp a model-provided box into the unit square; null if degenerate/missing. */
export function clampImageBox(raw: unknown): ImageBox | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) ? n : null
  }
  const x0 = num(b.x)
  const y0 = num(b.y)
  const w0 = num(b.w)
  const h0 = num(b.h)
  if (x0 === null || y0 === null || w0 === null || h0 === null) return null
  const x = Math.min(Math.max(x0, 0), 1)
  const y = Math.min(Math.max(y0, 0), 1)
  const w = Math.min(Math.max(w0, 0), 1 - x)
  const h = Math.min(Math.max(h0, 0), 1 - y)
  if (w <= 0.01 || h <= 0.01) return null
  return { x, y, w, h }
}

/** Parse + sanity-clamp an ISO-ish date string. '' when missing or out of range. */
export function coerceIsoDate(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return ''
  const ms = Date.parse(s)
  if (!Number.isFinite(ms) || ms < MIN_MS || ms > MAX_MS) return ''
  return new Date(ms).toISOString()
}

/** Coerce a price: free wins; otherwise a non-negative integer cents or null. */
function coercePrice(raw: Record<string, unknown>): { isFree: boolean; priceCents: number | null } {
  const free = raw.isFree === true || raw.free === true
  if (free) return { isFree: true, priceCents: null }
  const cents =
    typeof raw.priceCents === 'number'
      ? raw.priceCents
      : typeof raw.priceCents === 'string'
        ? Number(raw.priceCents)
        : NaN
  if (Number.isFinite(cents) && cents > 0) {
    return { isFree: false, priceCents: Math.round(cents) }
  }
  // No explicit price and not marked free: leave both unknown (treated as free
  // by the UI's default, but we do not assert it).
  return { isFree: false, priceCents: null }
}

/** A finite number clamped into [0,1], or null when unusable. */
function unit(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return null
  return Math.min(Math.max(n, 0), 1)
}

/** The default "looks fine" capture quality used when the model says nothing. */
const DEFAULT_QUALITY: CaptureQuality = { legible: true, glare: false, skew: false, note: null }

/**
 * Coerce the four poster corners. Keep them ONLY if all four are present and
 * every coordinate lands within 0..1; otherwise null (the UI then skips deskew).
 * Order is preserved: [top-left, top-right, bottom-right, bottom-left].
 */
export function coerceCorners(raw: unknown): [CornerPoint, CornerPoint, CornerPoint, CornerPoint] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const out: CornerPoint[] = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') return null
    const c = p as Record<string, unknown>
    const x = unit(c.x)
    const y = unit(c.y)
    // Reject the whole set if any coordinate was missing or out of range. unit()
    // clamps, so out-of-range originals would silently snap; guard the raw value.
    const xRaw = typeof c.x === 'number' ? c.x : typeof c.x === 'string' ? Number(c.x) : NaN
    const yRaw = typeof c.y === 'number' ? c.y : typeof c.y === 'string' ? Number(c.y) : NaN
    if (x === null || y === null) return null
    if (!(xRaw >= 0 && xRaw <= 1 && yRaw >= 0 && yRaw <= 1)) return null
    out.push({ x, y })
  }
  return [out[0], out[1], out[2], out[3]]
}

/** Coerce the capture-quality read; caps the retake note, defaults when absent. */
export function coerceQuality(raw: unknown): CaptureQuality {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_QUALITY }
  const q = raw as Record<string, unknown>
  const note = str(q.note, 160)
  return {
    legible: q.legible === false ? false : true,
    glare: q.glare === true,
    skew: q.skew === true,
    note: note || null,
  }
}

/** Whitelist a string against a known set, with a fallback when unknown. */
function oneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback
}

/** 'high' | 'low' field confidence, or undefined when absent/unknown. */
function coerceConfidence(raw: unknown): FieldConfidence | undefined {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return s === 'high' || s === 'low' ? (s as FieldConfidence) : undefined
}

/** A non-negative integer cents, or null. */
function coerceCents(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

const LINEUP_ROLES = ['band', 'speaker', 'dj', 'performer', 'host', 'other'] as const
const LINK_KINDS = ['tickets', 'rsvp', 'website', 'instagram', 'other'] as const
const REGION_KINDS = ['logo', 'photo', 'art'] as const

/** Trim + cap + drop-empty a string array. */
function strList(raw: unknown, max: number, itemMax = 80): string[] {
  const arr = Array.isArray(raw) ? raw : []
  const out: string[] = []
  for (const v of arr) {
    const s = str(v, itemMax)
    if (s) out.push(s)
    if (out.length >= max) break
  }
  return out
}

/**
 * Validate + length-cap the rich `details` harvest. Every nested field is
 * optional; we drop empty rows, clamp all boxes to 0..1, whitelist enums (unknown
 * -> 'other'/'photo'), coerce prices, and cap each array. Returns {} when there
 * is nothing worth persisting (so the JSONB column default stays clean).
 */
export function coerceEventDetails(raw: unknown): EventDetails {
  if (!raw || typeof raw !== 'object') return {}
  const d = raw as Record<string, unknown>
  const out: EventDetails = {}

  // lineup (<=24): name required; role whitelisted; optional note/imageBox/confidence.
  if (Array.isArray(d.lineup)) {
    const items: LineupItem[] = []
    for (const v of d.lineup) {
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      const name = str(o.name, 120)
      if (!name) continue
      const item: LineupItem = { name, role: oneOf(o.role, LINEUP_ROLES, 'other') }
      const note = str(o.note, 200)
      if (note) item.note = note
      const box = clampImageBox(o.imageBox)
      if (box) item.imageBox = box
      const conf = coerceConfidence(o.confidence)
      if (conf) item.confidence = conf
      items.push(item)
      if (items.length >= 24) break
    }
    if (items.length) out.lineup = items
  }

  // schedule (<=24): title required; optional time/note/confidence.
  if (Array.isArray(d.schedule)) {
    const items: ScheduleItem[] = []
    for (const v of d.schedule) {
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      const title = str(o.title, 160)
      if (!title) continue
      const item: ScheduleItem = { title }
      const time = str(o.time, 60)
      if (time) item.time = time
      const note = str(o.note, 200)
      if (note) item.note = note
      const conf = coerceConfidence(o.confidence)
      if (conf) item.confidence = conf
      items.push(item)
      if (items.length >= 24) break
    }
    if (items.length) out.schedule = items
  }

  // features (<=16): plain strings.
  const features = strList(d.features, 16)
  if (features.length) out.features = features

  // tickets (<=8): label required; priceCents non-negative int or null.
  if (Array.isArray(d.tickets)) {
    const items: TicketTier[] = []
    for (const v of d.tickets) {
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      const label = str(o.label, 120)
      if (!label) continue
      const item: TicketTier = { label }
      const cents = coerceCents(o.priceCents)
      if (cents !== null) item.priceCents = cents
      const note = str(o.note, 200)
      if (note) item.note = note
      const conf = coerceConfidence(o.confidence)
      if (conf) item.confidence = conf
      items.push(item)
      if (items.length >= 8) break
    }
    if (items.length) out.tickets = items
  }

  // links (<=10): label + url required; kind whitelisted.
  if (Array.isArray(d.links)) {
    const items: EventLink[] = []
    for (const v of d.links) {
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      const url = str(o.url, 300)
      if (!url) continue
      const label = str(o.label, 120) || url
      items.push({ label, url, kind: oneOf(o.kind, LINK_KINDS, 'other') })
      if (items.length >= 10) break
    }
    if (items.length) out.links = items
  }

  // sponsors (<=16): plain strings.
  const sponsors = strList(d.sponsors, 16, 120)
  if (sponsors.length) out.sponsors = sponsors

  // imageRegions (<=12): a usable box required; kind whitelisted.
  if (Array.isArray(d.imageRegions)) {
    const items: ImageRegion[] = []
    for (const v of d.imageRegions) {
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      const box = clampImageBox(o.box)
      if (!box) continue
      const item: ImageRegion = { box, kind: oneOf(o.kind, REGION_KINDS, 'photo') }
      const note = str(o.note, 200)
      if (note) item.note = note
      items.push(item)
      if (items.length >= 12) break
    }
    if (items.length) out.imageRegions = items
  }

  // other (<=16): label + value pairs.
  if (Array.isArray(d.other)) {
    const items: OtherDetail[] = []
    for (const v of d.other) {
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      const label = str(o.label, 80)
      const value = str(o.value, 200)
      if (!label || !value) continue
      items.push({ label, value })
      if (items.length >= 16) break
    }
    if (items.length) out.other = items
  }

  const conf = coerceConfidence(d.confidence)
  if (conf) out.confidence = conf

  return out
}

/** Arbitrary model JSON → a safe, fully-populated ExtractedEvent. */
export function coerceEventExtraction(raw: unknown): ExtractedEvent {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const coverRaw = (r.cover && typeof r.cover === 'object' ? r.cover : {}) as Record<string, unknown>
  const box = clampImageBox(coverRaw.box)
  const { isFree, priceCents } = coercePrice(r)

  const startsAt = coerceIsoDate(r.startsAt ?? r.starts_at)
  let endsAt = coerceIsoDate(r.endsAt ?? r.ends_at)
  // An end before the start is nonsense — drop it.
  if (startsAt && endsAt && Date.parse(endsAt) < Date.parse(startsAt)) endsAt = ''

  return {
    title: str(r.title, 160),
    description: str(r.description, 600),
    startsAt,
    endsAt,
    location: str(r.location, 240),
    isFree,
    priceCents,
    organizerName: str(r.organizerName ?? r.organizer_name, 160),
    organizerContact: str(r.organizerContact ?? r.organizer_contact, 200),
    domain: coerceDomain(r.domain),
    tags: dedupeEventTags(r.tags),
    cover: {
      found: box !== null || coverRaw.found === true,
      box,
      imageIndex:
        typeof coverRaw.imageIndex === 'number' && coverRaw.imageIndex >= 0
          ? Math.floor(coverRaw.imageIndex)
          : 0,
    },
    corners: coerceCorners(r.corners),
    quality: coerceQuality(r.quality),
    details: coerceEventDetails(r.details),
  }
}
