// The Loom — upload classification (Airwaves P0, ADR-608). One PURE place that maps a file's MIME to
// its Loom lane: which `library_assets.kind` it is, which Storage bucket it lands in, and its size
// ceiling. It is what lets the existing image uploaders (lib/page-editor/loom-field-actions.ts,
// app/(main)/admin/library/actions.ts) stop hard-rejecting audio/video WITHOUT changing image
// behavior: an image still resolves to { kind:'image', bucket:'library-media', 20 MB } byte-for-byte,
// while audio/video resolve to the A/V bucket (recordings-media, 500 MB) added in 20261150000000.
//
// PURE (mime string in, target out), so it is trivially testable and carries no server-only imports.

/** The file-backed Loom lanes an upload can classify into (a subset of LIBRARY_KINDS). */
export type LoomUploadKind = 'image' | 'audio' | 'video'

/** Where an upload of a given kind lands: its Loom `kind`, its Storage bucket, and its byte ceiling. */
export interface LoomUploadTarget {
  kind: LoomUploadKind
  bucket: string
  maxBytes: number
}

/** The 20 MB image ceiling (unchanged from the original library-media bucket). */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024
/** The 500 MB A/V ceiling (recordings-media bucket, 20261150000000). Matches the bucket file_size_limit. */
export const MEDIA_MAX_BYTES = 500 * 1024 * 1024

/** The image bucket (unchanged). */
export const LIBRARY_MEDIA_BUCKET = 'library-media' as const
/** The A/V bucket (Airwaves P0). */
export const RECORDINGS_MEDIA_BUCKET = 'recordings-media' as const

/**
 * Classify an upload by MIME type into its Loom lane, or null when the type is not an accepted Loom
 * file (the caller then rejects it). Images route to library-media (20 MB) exactly as before; audio +
 * video route to recordings-media (500 MB). PURE.
 */
export function classifyLoomUpload(mime: string | null | undefined): LoomUploadTarget | null {
  const m = (mime ?? '').toLowerCase().trim()
  if (m.startsWith('image/')) {
    return { kind: 'image', bucket: LIBRARY_MEDIA_BUCKET, maxBytes: IMAGE_MAX_BYTES }
  }
  if (m.startsWith('audio/')) {
    return { kind: 'audio', bucket: RECORDINGS_MEDIA_BUCKET, maxBytes: MEDIA_MAX_BYTES }
  }
  if (m.startsWith('video/')) {
    return { kind: 'video', bucket: RECORDINGS_MEDIA_BUCKET, maxBytes: MEDIA_MAX_BYTES }
  }
  return null
}

// Image extensions we accept, mapped to their canonical MIME. Some browsers/OSes report an EMPTY or
// wrong `File.type` for iPhone camera-roll photos (.heic/.heif) and a few others, which then get
// silently dropped by a loose `type.startsWith('image/')` gate ("the uploader does nothing"). When the
// MIME is missing we recover it from the extension here, so the file is still classified + uploaded with
// a correct content-type. Keep in lockstep with the buckets' allowed_mime_types.
const IMAGE_EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  svg: 'image/svg+xml',
}

/** The lowercased extension of a filename (no dot), or '' when it has none. PURE. */
function extOf(filename: string | null | undefined): string {
  const name = (filename ?? '').trim().toLowerCase()
  const dot = name.lastIndexOf('.')
  return dot >= 0 && dot < name.length - 1 ? name.slice(dot + 1) : ''
}

/**
 * Best-effort MIME for a file: its browser-reported `type` when present, else recovered from the
 * filename extension (so an empty/misreported image type is not silently dropped). Returns '' when
 * neither yields a known image/av type. PURE.
 */
export function effectiveMime(type: string | null | undefined, filename: string | null | undefined): string {
  const t = (type ?? '').toLowerCase().trim()
  if (t) return t
  const ext = extOf(filename)
  return IMAGE_EXT_MIME[ext] ?? ''
}

/** Whether a file looks like an image the Loom accepts — by MIME OR by a known image extension. Used by
 *  the client upload gates so a blank-MIME camera-roll photo is not filtered out before it can upload. PURE. */
export function looksLikeImage(type: string | null | undefined, filename: string | null | undefined): boolean {
  const m = effectiveMime(type, filename)
  return m.startsWith('image/')
}

/** A default file extension for a Loom kind, when the original filename has none. PURE. */
export function fallbackExtFor(kind: LoomUploadKind): string {
  switch (kind) {
    case 'audio':
      return 'mp3'
    case 'video':
      return 'mp4'
    default:
      return 'jpg'
  }
}

/** A default content-type for a Loom kind, when the browser sends none. PURE. */
export function fallbackMimeFor(kind: LoomUploadKind): string {
  switch (kind) {
    case 'audio':
      return 'audio/mpeg'
    case 'video':
      return 'video/mp4'
    default:
      return 'image/jpeg'
  }
}
