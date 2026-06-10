// Pure helpers for the Poster Events extraction — no I/O, fully unit-tested. This
// is the trust boundary for AI output: coerceEventExtraction() turns arbitrary
// model JSON (vision scan or text assist) into a safe, fully-populated
// ExtractedEvent. Keeping it pure means we can test the harvest without a live
// model. Mirrors lib/connections/normalize.ts (coerceExtraction).

import type { ExtractedEvent, ImageBox, DomainSlug } from './types'

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
  }
}

/** True when the harvest produced anything worth pre-filling the form with. */
export function hasAnyEventContent(e: ExtractedEvent): boolean {
  return Boolean(
    e.title || e.description || e.startsAt || e.location ||
    e.organizerName || e.organizerContact || e.tags.length || e.domain,
  )
}
