import { describe, it, expect } from 'vitest'
import { encodeTypeExtension, isHeicFile, prepareImageForUpload, shrinkImageForUpload, SHRINK_TARGET_BYTES } from './image-shrink'

// Pure/branch coverage only: the decode/encode paths need a real browser (createImageBitmap, canvas,
// heic2any's wasm), so they are exercised manually. What CAN be pinned here is the detection seam —
// which files route into HEIC conversion at all — and that non-HEIC files pass through untouched.

describe('isHeicFile', () => {
  it('detects HEIC/HEIF by browser-reported MIME', () => {
    expect(isHeicFile(new File(['x'], 'photo.heic', { type: 'image/heic' }))).toBe(true)
    expect(isHeicFile(new File(['x'], 'photo.heif', { type: 'image/heif' }))).toBe(true)
    expect(isHeicFile(new File(['x'], 'burst.heic', { type: 'image/heic-sequence' }))).toBe(true)
  })

  it('detects HEIC by extension when the type is blank (iPhone camera-roll files)', () => {
    expect(isHeicFile(new File(['x'], 'IMG_4321.HEIC', { type: '' }))).toBe(true)
    expect(isHeicFile(new File(['x'], 'IMG_4321.heif', { type: '' }))).toBe(true)
  })

  it('leaves ordinary images alone', () => {
    expect(isHeicFile(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).toBe(false)
    expect(isHeicFile(new File(['x'], 'a.png', { type: '' }))).toBe(false)
    expect(isHeicFile(new File(['x'], 'a.webp', { type: 'image/webp' }))).toBe(false)
  })
})

describe('prepareImageForUpload', () => {
  it('returns a small non-HEIC file untouched (no conversion, no shrink)', async () => {
    const file = new File(['tiny'], 'a.jpg', { type: 'image/jpeg' })
    expect(file.size).toBeLessThanOrEqual(SHRINK_TARGET_BYTES)
    const res = await prepareImageForUpload(file)
    expect('file' in res && res.file).toBe(file)
  })
})

// ── Alpha preservation (the black-background bug) ────────────────────────────────────────────────
// A transparent PNG over the shrink threshold used to be re-encoded to JPEG in the browser. JPEG has
// no alpha channel, so the canvas's transparent black came through as a solid BLACK background, and
// the image arrived ruined before the upload had even started. These pin the two halves that CAN be
// checked without a browser: the format-to-extension contract, and the fail-safe direction.

describe('encodeTypeExtension', () => {
  it('names a WebP encode .webp and a JPEG encode .jpg', () => {
    expect(encodeTypeExtension('image/webp')).toBe('webp')
    expect(encodeTypeExtension('image/jpeg')).toBe('jpg')
  })
})

describe('shrinkImageForUpload — fail-safe', () => {
  // Under vitest there is no createImageBitmap, so the decode throws and the catch returns the
  // ORIGINAL file. That is the behaviour that matters: when we cannot inspect an image, we must not
  // guess at its format. A silent JPEG here is exactly how the alpha was lost.
  it('returns an oversized PNG untouched when it cannot be decoded', async () => {
    const big = new File([new Uint8Array(SHRINK_TARGET_BYTES + 1024)], 'cutout.png', { type: 'image/png' })
    const out = await shrinkImageForUpload(big)
    expect(out).toBe(big)
    expect(out.type).toBe('image/png')
    expect(out.name.endsWith('.png')).toBe(true)
  })

  it('leaves an oversized PNG as a PNG through prepareImageForUpload too', async () => {
    const big = new File([new Uint8Array(SHRINK_TARGET_BYTES + 1024)], 'cutout.png', { type: 'image/png' })
    const res = await prepareImageForUpload(big)
    expect('file' in res && res.file.type).toBe('image/png')
  })
})
