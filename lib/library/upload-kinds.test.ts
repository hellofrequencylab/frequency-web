import { describe, it, expect } from 'vitest'
import { classifyLoomUpload, effectiveMime, looksLikeImage } from './upload-kinds'

describe('effectiveMime', () => {
  it('uses the browser-reported type when present', () => {
    expect(effectiveMime('image/png', 'x.png')).toBe('image/png')
    expect(effectiveMime('image/heic', 'photo.HEIC')).toBe('image/heic')
  })

  it('recovers a missing type from the filename extension', () => {
    // iPhone camera-roll photos often arrive with a blank File.type — the core of the upload bug.
    expect(effectiveMime('', 'IMG_4321.heic')).toBe('image/heic')
    expect(effectiveMime('', 'IMG_4321.HEIF')).toBe('image/heif')
    expect(effectiveMime(undefined, 'logo.svg')).toBe('image/svg+xml')
    expect(effectiveMime('', 'shot.JPG')).toBe('image/jpeg')
  })

  it('returns empty when neither type nor a known extension is available', () => {
    expect(effectiveMime('', 'notes.txt')).toBe('')
    expect(effectiveMime('', 'noext')).toBe('')
    expect(effectiveMime('', '')).toBe('')
  })
})

describe('looksLikeImage', () => {
  it('accepts real images by MIME or by extension (blank type)', () => {
    expect(looksLikeImage('image/jpeg', 'a.jpg')).toBe(true)
    expect(looksLikeImage('', 'a.heic')).toBe(true)
    expect(looksLikeImage('', 'a.png')).toBe(true)
  })

  it('rejects non-images', () => {
    expect(looksLikeImage('application/pdf', 'a.pdf')).toBe(false)
    expect(looksLikeImage('', 'a.mp4')).toBe(false)
    expect(looksLikeImage('', 'a.txt')).toBe(false)
  })
})

describe('classifyLoomUpload with recovered heic mime', () => {
  it('routes a recovered heic to the image lane / library-media', () => {
    const target = classifyLoomUpload(effectiveMime('', 'IMG_1.heic'))
    expect(target).not.toBeNull()
    expect(target!.kind).toBe('image')
    expect(target!.bucket).toBe('library-media')
  })
})
