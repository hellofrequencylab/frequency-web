// The Loom — upload classification (Airwaves P0, ADR-608). One PURE place that maps a file's MIME to
// its Loom lane: which `library_assets.kind` it is, which Storage bucket it lands in, and its size
// ceiling. It is what lets the existing image uploaders (lib/page-editor/loom-field-actions.ts,
// app/(main)/admin/library/actions.ts) stop hard-rejecting audio/video WITHOUT changing image
// behavior: an image still resolves to { kind:'image', bucket:'library-media', 20 MB } byte-for-byte,
// while audio/video resolve to the A/V bucket (recordings-media, 500 MB) added in 20261150000000.
//
// PURE (mime string in, target out), so it is trivially testable and carries no server-only imports.

/** The file-backed Loom lanes an upload can classify into (a subset of LIBRARY_KINDS). */
type LoomUploadKind = 'image' | 'audio' | 'video' | 'font' | 'document'

/** Where an upload of a given kind lands: its Loom `kind`, its Storage bucket, and its byte ceiling. */
interface LoomUploadTarget {
  kind: LoomUploadKind
  bucket: string
  maxBytes: number
}

/** The 20 MB image ceiling (unchanged from the original library-media bucket). */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024
/** The 500 MB A/V ceiling (recordings-media bucket, 20261150000000). Matches the bucket file_size_limit. */
const MEDIA_MAX_BYTES = 500 * 1024 * 1024

/** The image bucket (unchanged). */
export const LIBRARY_MEDIA_BUCKET = 'library-media' as const
/** The A/V bucket (Airwaves P0). */
const RECORDINGS_MEDIA_BUCKET = 'recordings-media' as const
/** The PRIVATE font + document bucket (LIVE-692, 20270346001700). Its rows carry no url and are
 *  served signed (signedLibraryAssetUrl). */
export const LIBRARY_FILES_BUCKET = 'library-files' as const
/** The 25 MB file-lane ceiling. Matches the bucket file_size_limit. */
const FILE_MAX_BYTES = 25 * 1024 * 1024

/** The font MIME types the library-files bucket accepts (lockstep with its allowed_mime_types). */
const FONT_MIMES = new Set([
  'font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'font/collection',
  'application/font-woff', 'application/x-font-ttf', 'application/x-font-otf', 'application/vnd.ms-opentype',
])
/** The document MIME types the library-files bucket accepts (lockstep with its allowed_mime_types). */
const DOCUMENT_MIMES = new Set([
  'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

/** True when the target bucket is private, so the row stores no public url. PURE. */
export function isPrivateUploadBucket(bucket: string): boolean {
  return bucket === LIBRARY_FILES_BUCKET
}

/**
 * Classify an upload by MIME type into its Loom lane, or null when the type is not an accepted Loom
 * file (the caller then rejects it). Images route to library-media (20 MB) exactly as before; audio +
 * video route to recordings-media (500 MB). PURE.
 */
export function classifyLoomUpload(
  mime: string | null | undefined,
  opts: { files?: boolean } = {},
): LoomUploadTarget | null {
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
  // The file lanes (LIVE-692): private, served signed. Only the Studio's own upload opts in, so an
  // image picker can never take a PDF.
  if (!opts.files) return null
  if (FONT_MIMES.has(m)) return { kind: 'font', bucket: LIBRARY_FILES_BUCKET, maxBytes: FILE_MAX_BYTES }
  if (DOCUMENT_MIMES.has(m)) return { kind: 'document', bucket: LIBRARY_FILES_BUCKET, maxBytes: FILE_MAX_BYTES }
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

// Font and document extensions, for the same reason: browsers report fonts with an empty or
// vendor-specific type more often than not (LIVE-692).
const FILE_EXT_MIME: Record<string, string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
  ttc: 'font/collection',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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

/** effectiveMime for the Studio's file lanes (LIVE-692): a font often arrives typed
 *  application/octet-stream or not at all, so a known font or document extension wins over those
 *  two. Every other type is the browser's, as in effectiveMime. PURE. */
export function effectiveFileMime(type: string | null | undefined, filename: string | null | undefined): string {
  const t = (type ?? '').toLowerCase().trim()
  const fromExt = FILE_EXT_MIME[extOf(filename)]
  if (fromExt && (!t || t === 'application/octet-stream')) return fromExt
  return effectiveMime(type, filename)
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
    case 'font':
      return 'woff2'
    case 'document':
      return 'pdf'
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
    case 'font':
      return 'font/woff2'
    case 'document':
      return 'application/pdf'
    default:
      return 'image/jpeg'
  }
}
