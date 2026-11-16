// The one allowlist for image uploads that land in a public bucket (SCAN-1217).
//
// A browser-declared `file.type` and a visitor-chosen file name are both attacker input. An
// `image/svg+xml` object can carry script and is served executable from the storage CDN URL, so SVG
// is excluded on purpose. The type is read from the file's own first bytes, and the stored extension
// comes from that verified type, never from the name.

type RasterImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'image/avif'

const EXT: Record<RasterImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

export const RASTER_IMAGE_MESSAGE = 'Use a JPEG, PNG, WebP, GIF, or AVIF image.'

const ascii = (b: Uint8Array, at: number, s: string) => s.split('').every((c, i) => b[at + i] === c.charCodeAt(0))

/** The raster type the bytes really are, or null (SVG, HTML, anything else). */
function sniffRasterType(bytes: Uint8Array): RasterImageType | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && ascii(bytes, 1, 'PNG')) return 'image/png'
  if (ascii(bytes, 0, 'GIF87a') || ascii(bytes, 0, 'GIF89a')) return 'image/gif'
  if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) return 'image/webp'
  if (ascii(bytes, 4, 'ftyp') && (ascii(bytes, 8, 'avif') || ascii(bytes, 8, 'avis'))) return 'image/avif'
  return null
}

/** Verify an uploaded File: the bytes must be an allowlisted raster. Returns the verified type, the
 *  extension to store under, and the bytes; the caller uploads with `contentType: type`. */
export async function verifyRasterUpload(
  file: File,
): Promise<{ type: RasterImageType; ext: string; bytes: Uint8Array } | null> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffRasterType(bytes)
  if (!type) return null
  return { type, ext: EXT[type], bytes }
}
