// Pure helpers for the Profile Creator — no I/O, fully unit-tested. This is the
// trust boundary for AI output: coerceExtraction() turns arbitrary model JSON
// (vision scan or Vera text assist) into a safe, fully-populated ExtractedContact,
// and the crop geometry turns a normalized face box into a pixel rect for the
// canvas cropper. Keeping these pure means we can test the harvest + crop without
// a live model or a browser.

import type { ExtractedContact, FaceBox, ContactSocials } from './types'

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

/** Arbitrary model JSON → a safe, fully-populated ExtractedContact. */
export function coerceExtraction(raw: unknown): ExtractedContact {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const photoRaw = (r.photo && typeof r.photo === 'object' ? r.photo : {}) as Record<string, unknown>
  const box = clampBox(photoRaw.box)
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
    photo: {
      found: box !== null || photoRaw.found === true,
      box,
      imageIndex:
        typeof photoRaw.imageIndex === 'number' && photoRaw.imageIndex >= 0
          ? Math.floor(photoRaw.imageIndex)
          : 0,
    },
  }
}

/** True when the harvest produced anything worth pre-filling the form with. */
export function hasAnyContent(e: ExtractedContact): boolean {
  return Boolean(
    e.displayName || e.email || e.phone || e.title || e.company || e.city ||
    e.website || e.tags.length || e.connectionNote ||
    e.socials.instagram || e.socials.linkedin || e.socials.x || e.socials.other,
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
