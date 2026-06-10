// Pure helpers for the Profile Creator — no I/O, fully unit-tested. This is the
// trust boundary for AI output: coerceExtraction() turns arbitrary model JSON
// (vision scan or Vera text assist) into a safe, fully-populated ExtractedContact,
// and the crop geometry turns a normalized face box into a pixel rect for the
// canvas cropper. Keeping these pure means we can test the harvest + crop without
// a live model or a browser.

import { coerceCorners, coerceQuality } from '@/lib/events/normalize'
import type {
  ExtractedContact,
  FaceBox,
  ContactSocials,
  ContactDetails,
  ContactPhone,
  ContactEmail,
  ContactLink,
  ContactOtherDetail,
  CardCorners,
  FieldConfidence,
} from './types'

/** Trim + length-cap a possibly-non-string value; '' when absent. */
function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** One tag → trimmed, single-spaced, leading-'#' stripped, length-capped. */
export function normalizeTag(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
  return s.replace(/^#+/, '').trim().slice(0, 40)
}

/** Normalize, drop empties, dedupe case-insensitively (first spelling wins), cap. */
export function dedupeTags(tags: unknown, max = 12): string[] {
  const arr = Array.isArray(tags) ? tags : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of arr) {
    const tag = normalizeTag(t)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= max) break
  }
  return out
}

/** Clamp a model-provided box into the unit square; null if degenerate/missing. */
export function clampBox(raw: unknown): FaceBox | null {
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

function coerceSocials(raw: unknown): ContactSocials {
  if (!raw || typeof raw !== 'object') return {}
  const s = raw as Record<string, unknown>
  const out: ContactSocials = {}
  const ig = str(s.instagram, 120)
  if (ig) out.instagram = ig
  const li = str(s.linkedin, 200)
  if (li) out.linkedin = li
  const x = str(s.x ?? s.twitter, 120)
  if (x) out.x = x
  const other = str(s.other, 200)
  if (other) out.other = other
  return out
}

/** 'high' | 'low' field confidence, or undefined when absent/unknown. */
function coerceConfidence(raw: unknown): FieldConfidence | undefined {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return s === 'high' || s === 'low' ? (s as FieldConfidence) : undefined
}

/** Whitelist a string against a known set, with a fallback when unknown. */
function oneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback
}

/** Trim + cap + drop-empty a string array. */
function strList(raw: unknown, max: number, itemMax = 120): string[] {
  const arr = Array.isArray(raw) ? raw : []
  const out: string[] = []
  for (const v of arr) {
    const s = str(v, itemMax)
    if (s) out.push(s)
    if (out.length >= max) break
  }
  return out
}

const LINK_KINDS = ['website', 'booking', 'portfolio', 'other'] as const

/**
 * Validate + length-cap the rich `details` harvest from a card. Every nested
 * field is optional; we drop empty rows, whitelist enums (unknown -> 'other'),
 * and cap each array (phones 4, emails 4, addresses 3, services 12,
 * certifications 8, links 8, other 12). Returns {} when there is nothing worth
 * persisting (so the JSONB column default stays clean). Mirrors
 * lib/events/normalize.ts (coerceEventDetails).
 */
export function coerceContactDetails(raw: unknown): ContactDetails {
  if (!raw || typeof raw !== 'object') return {}
  const d = raw as Record<string, unknown>
  const out: ContactDetails = {}

  // phones (<=4): number required; optional label/confidence.
  if (Array.isArray(d.phones)) {
    const items: ContactPhone[] = []
    for (const v of d.phones) {
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      const number = str(o.number ?? o.phone, 40)
      if (!number) continue
      const item: ContactPhone = { label: str(o.label, 40), number }
      const conf = coerceConfidence(o.confidence)
      if (conf) item.confidence = conf
      items.push(item)
      if (items.length >= 4) break
    }
    if (items.length) out.phones = items
  }

  // emails (<=4): address required; optional label/confidence.
  if (Array.isArray(d.emails)) {
    const items: ContactEmail[] = []
    for (const v of d.emails) {
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      const address = str(o.address ?? o.email, 200).toLowerCase()
      if (!address) continue
      const item: ContactEmail = { label: str(o.label, 40), address }
      const conf = coerceConfidence(o.confidence)
      if (conf) item.confidence = conf
      items.push(item)
      if (items.length >= 4) break
    }
    if (items.length) out.emails = items
  }

  // addresses (<=3), services (<=12), certifications (<=8): plain strings.
  const addresses = strList(d.addresses, 3, 240)
  if (addresses.length) out.addresses = addresses
  const services = strList(d.services, 12)
  if (services.length) out.services = services
  const certifications = strList(d.certifications, 8)
  if (certifications.length) out.certifications = certifications

  // hours: a single free-text line ("Mon to Fri 9 to 5").
  const hours = str(d.hours, 200)
  if (hours) out.hours = hours

  // links (<=8): url required; kind whitelisted.
  if (Array.isArray(d.links)) {
    const items: ContactLink[] = []
    for (const v of d.links) {
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      const url = str(o.url, 300)
      if (!url) continue
      const item: ContactLink = {
        label: str(o.label, 120) || url,
        url,
        kind: oneOf(o.kind, LINK_KINDS, 'other'),
      }
      const conf = coerceConfidence(o.confidence)
      if (conf) item.confidence = conf
      items.push(item)
      if (items.length >= 8) break
    }
    if (items.length) out.links = items
  }

  // other (<=12): label + value pairs.
  if (Array.isArray(d.other)) {
    const items: ContactOtherDetail[] = []
    for (const v of d.other) {
      if (!v || typeof v !== 'object') continue
      const o = v as Record<string, unknown>
      const label = str(o.label, 80)
      const value = str(o.value, 240)
      if (!label || !value) continue
      const item: ContactOtherDetail = { label, value }
      const conf = coerceConfidence(o.confidence)
      if (conf) item.confidence = conf
      items.push(item)
      if (items.length >= 12) break
    }
    if (items.length) out.other = items
  }

  const conf = coerceConfidence(d.confidence)
  if (conf) out.confidence = conf

  return out
}

/**
 * Coerce the per-image card corners: an array aligned to the input images where
 * entry i is the four corners of the card in image i, or null when that side's
 * corners are missing/unusable. Each quad is validated by the events
 * coerceCorners (all four points present and within 0..1, order preserved).
 */
export function coerceCardCorners(raw: unknown, maxImages = 6): (CardCorners | null)[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, maxImages).map((entry) => coerceCorners(entry))
}

/** A found/box/imageIndex region (the photo and logo share this shape). */
function coerceRegion(raw: unknown): { found: boolean; box: FaceBox | null; imageIndex: number } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const box = clampBox(r.box)
  return {
    found: box !== null || r.found === true,
    box,
    imageIndex:
      typeof r.imageIndex === 'number' && r.imageIndex >= 0 ? Math.floor(r.imageIndex) : 0,
  }
}

/** Arbitrary model JSON → a safe, fully-populated ExtractedContact. */
export function coerceExtraction(raw: unknown): ExtractedContact {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    displayName: str(r.displayName ?? r.name, 120),
    email: str(r.email, 200).toLowerCase(),
    phone: str(r.phone, 40),
    title: str(r.title, 120),
    company: str(r.company, 120),
    city: str(r.city, 120),
    website: str(r.website, 200),
    socials: coerceSocials(r.socials),
    tags: dedupeTags(r.tags),
    connectionNote: str(r.connectionNote ?? r.note, 600),
    photo: coerceRegion(r.photo),
    logo: coerceRegion(r.logo),
    corners: coerceCardCorners(r.corners),
    quality: coerceQuality(r.quality),
    details: coerceContactDetails(r.details),
  }
}

/** True when the flexible details harvest holds at least one row. */
export function hasAnyDetails(d: ContactDetails): boolean {
  return Boolean(
    d.phones?.length || d.emails?.length || d.addresses?.length || d.services?.length ||
    d.certifications?.length || d.hours || d.links?.length || d.other?.length,
  )
}

/** True when the harvest produced anything worth pre-filling the form with. */
export function hasAnyContent(e: ExtractedContact): boolean {
  return Boolean(
    e.displayName || e.email || e.phone || e.title || e.company || e.city ||
    e.website || e.tags.length || e.connectionNote ||
    e.socials.instagram || e.socials.linkedin || e.socials.x || e.socials.other ||
    hasAnyDetails(e.details),
  )
}

/** Normalized face box → a square pixel crop rect (centered, padded, clamped in
 *  bounds). Pure geometry the client cropper applies to a <canvas>. */
export function squareCropRect(
  box: FaceBox,
  imgW: number,
  imgH: number,
  pad = 0.35,
): { sx: number; sy: number; size: number } {
  const cx = (box.x + box.w / 2) * imgW
  const cy = (box.y + box.h / 2) * imgH
  const side = Math.max(box.w * imgW, box.h * imgH) * (1 + pad)
  const size = Math.max(1, Math.min(side, imgW, imgH))
  const sx = Math.min(Math.max(cx - size / 2, 0), imgW - size)
  const sy = Math.min(Math.max(cy - size / 2, 0), imgH - size)
  return { sx: Math.round(sx), sy: Math.round(sy), size: Math.round(size) }
}
