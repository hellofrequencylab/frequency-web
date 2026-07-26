import { describe, it, expect } from 'vitest'
import { isHeicFile, prepareImageForUpload, SHRINK_TARGET_BYTES } from './image-shrink'

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
