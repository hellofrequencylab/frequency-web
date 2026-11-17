// Pure helpers for the Profile Creator that the browser also uses: tag cleanup, the "is there anything here" reads
// and the crop geometry that turns a normalized face box into a pixel rect for the canvas cropper. No I/O, fully
// unit-tested. The trust boundary for AI output (coerceExtraction and the details reader) lives beside this file in
// ./extraction.ts, on the shared schema, so this one stays free of it and light for the client components.

import type { ExtractedContact, FaceBox, ContactDetails } from './types'

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
