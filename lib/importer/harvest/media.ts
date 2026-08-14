// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — harvest media capture (P1, docs/BUSINESS-IMPORTER.md §6.2).
// Pull a harvested og:image / logo into the public `site-media` bucket so the
// materializer (P0) can store it as a ready public url. SERVER-ONLY, admin storage
// client. Every upload path is namespaced under the INTAKE id (tenancy: an import's
// media lives under its own prefix, never collides with another's).
//
// FAIL-SAFE: a download or upload error returns null (the harvest records the source url
// with its status and moves on). We NEVER assert ownership of a harvested image; the
// source url is recorded on the HarvestedSource for the rights trail (docs §7).
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import { isFetchableUrl } from '@/lib/ai/web'

const BUCKET = 'site-media'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // mirror the editor's 8MB cap
const FETCH_TIMEOUT_MS = 10_000
/** A gallery capture is meant to be a PHOTO of the business. The url-level chrome filter
 *  (./plan isLikelyChromeImage) catches the obvious cases; this byte floor catches what only the
 *  response reveals: a tracking pixel, a spacer gif, a tiny ui chip. Logo/hero are exempt, since a
 *  legitimate logo is often a small file. */
const MIN_GALLERY_BYTES = 5 * 1024

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'])

function extFor(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/svg+xml':
      return 'svg'
    default:
      return 'img'
  }
}

/** The result of capturing one image url into site-media. */
export interface CapturedImage {
  /** The public url of the uploaded copy (feeds BusinessProfile.media). */
  publicUrl: string
  /** The storage path (under the intake prefix). */
  path: string
  /** The original source url (recorded on the HarvestedSource for the rights trail). */
  sourceUrl: string
}

/**
 * Download `imageUrl` and upload it into `site-media` under `importer/<intakeId>/…`, returning
 * its public url. Returns null on any failure (fail-safe). Binds the storage path to the intake
 * id so an import's media is namespaced to it. `role` (logo/hero/gallery) shapes the file name for
 * legibility, and tightens the accept rules for `gallery` (no svg, no sub-5KB pixel) so a chrome
 * asset that slipped past the url filter never lands in a seeded page's gallery.
 */
export async function captureImage(
  intakeId: string,
  imageUrl: string,
  role: 'logo' | 'hero' | 'gallery',
): Promise<CapturedImage | null> {
  if (!isFetchableUrl(imageUrl)) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { 'user-agent': 'FrequencyImporter/1.0 (+https://hellofrequency.com)' },
    })
    if (!res.ok) return null
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) return null
    // A gallery slot is a photograph; a vector mark is a logo by another name.
    if (role === 'gallery' && contentType === 'image/svg+xml') return null
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null
    if (role === 'gallery' && buf.length < MIN_GALLERY_BYTES) return null

    const admin = createAdminClient()
    const path = `importer/${intakeId}/${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFor(contentType)}`
    const { error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType, upsert: false })
    if (error) return null
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
    return { publicUrl: data.publicUrl, path, sourceUrl: imageUrl }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
