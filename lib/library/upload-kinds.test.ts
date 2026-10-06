import { describe, it, expect } from 'vitest'
import { classifyLoomUpload, effectiveFileMime, effectiveMime, isPrivateUploadBucket, looksLikeImage } from './upload-kinds'

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

describe('the font and document lanes (LIVE-692)', () => {
  it('routes fonts and documents to the private library-files bucket, only when the caller opts in', () => {
    expect(classifyLoomUpload('font/woff2', { files: true })).toEqual({ kind: 'font', bucket: 'library-files', maxBytes: 25 * 1024 * 1024 })
    expect(classifyLoomUpload('application/pdf', { files: true })?.kind).toBe('document')
    expect(classifyLoomUpload('text/csv', { files: true })?.bucket).toBe('library-files')
    // An image picker never opts in, so it can never take a PDF or a font.
    expect(classifyLoomUpload('application/pdf')).toBeNull()
    expect(classifyLoomUpload('font/woff2')).toBeNull()
    // Images keep their lane either way.
    expect(classifyLoomUpload('image/png', { files: true })?.bucket).toBe('library-media')
    expect(classifyLoomUpload('application/zip', { files: true })).toBeNull()
  })

  it('reads a font or document type from its extension when the browser reports none', () => {
    expect(effectiveFileMime('', 'Brand.WOFF2')).toBe('font/woff2')
    expect(effectiveFileMime('application/octet-stream', 'brand.otf')).toBe('font/otf')
    expect(effectiveFileMime('', 'deck.pdf')).toBe('application/pdf')
    expect(effectiveFileMime('application/pdf', 'odd.txt')).toBe('application/pdf')
    expect(effectiveFileMime('', 'IMG_1.heic')).toBe('image/heic')
  })

  it('marks only library-files as private', () => {
    expect(isPrivateUploadBucket('library-files')).toBe(true)
    expect(isPrivateUploadBucket('library-media')).toBe(false)
  })
})
