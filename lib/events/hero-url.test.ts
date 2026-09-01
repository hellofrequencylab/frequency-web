import { describe, it, expect } from 'vitest'
import { eventHeroCandidates, resolveEventHeroUrl, EVENT_MEDIA_BUCKET } from './hero-url'
import { POSTER_BUCKET } from './poster-media'

// The precedence itself, exercised without a client or a network: uploaded cover → full scanned
// poster → the scanner's cropped cover. These are the rules every event surface now inherits, so a
// change here is a change to what the page hero, the share card and the claim card all show.

const deps = (over: Partial<Parameters<typeof resolveEventHeroUrl>[1]> = {}) => ({
  publicUrl: (p: string) => `https://public/${p}`,
  signedUrl: async (p: string) => `https://signed/${p}?token=abc`,
  ...over,
})

describe('eventHeroCandidates', () => {
  it('puts the host-uploaded cover first, in the PUBLIC bucket', () => {
    expect(
      eventHeroCandidates({
        cover_image_path: 'u/cover.jpg',
        poster_path: 'u/poster.jpg',
        details: { media: { coverPath: 'u/crop.jpg' } },
      }),
    ).toEqual([
      { path: 'u/cover.jpg', bucket: EVENT_MEDIA_BUCKET },
      { path: 'u/poster.jpg', bucket: POSTER_BUCKET },
      { path: 'u/crop.jpg', bucket: POSTER_BUCKET },
    ])
  })

  it('ranks the ORIGINAL flyer above the scanner crop, which is a lossy derivative of it', () => {
    const order = eventHeroCandidates({
      poster_path: 'u/poster.jpg',
      details: { media: { coverPath: 'u/crop.jpg' } },
    }).map((c) => c.path)
    expect(order).toEqual(['u/poster.jpg', 'u/crop.jpg'])
  })

  it('yields nothing for an event with no artwork, or no row at all', () => {
    expect(eventHeroCandidates({ cover_image_path: null, poster_path: null, details: null })).toEqual([])
    expect(eventHeroCandidates(null)).toEqual([])
    expect(eventHeroCandidates(undefined)).toEqual([])
  })
})

describe('resolveEventHeroUrl', () => {
  it('returns the uploaded cover as a PUBLIC url when the host uploaded one', async () => {
    // 🔴 The shipped regression in one assertion: this is the common case (a host uploads a cover),
    // and the share card resolved null for it and fell back to a plain text card.
    await expect(
      resolveEventHeroUrl({ cover_image_path: 'u/cover.jpg', poster_path: 'u/poster.jpg' }, deps()),
    ).resolves.toBe('https://public/u/cover.jpg')
  })

  it('signs the full poster for a scanned event with no uploaded cover', async () => {
    await expect(
      resolveEventHeroUrl(
        { poster_path: 'u/poster.jpg', details: { media: { coverPath: 'u/crop.jpg' } } },
        deps(),
      ),
    ).resolves.toBe('https://signed/u/poster.jpg?token=abc')
  })

  it('falls back to the scanner crop when that is all there is', async () => {
    await expect(
      resolveEventHeroUrl({ details: { media: { coverPath: 'u/crop.jpg' } } }, deps()),
    ).resolves.toBe('https://signed/u/crop.jpg?token=abc')
  })

  it('DEGRADES to the next source when a URL cannot be built, rather than erasing the image', async () => {
    // An unsignable/unbuildable path is a broken tier, not a coverless event. The surfaces here all
    // fall back to a text or placeholder card, so returning null would trade a real photo for a
    // plain card over one bad path.
    await expect(
      resolveEventHeroUrl(
        { cover_image_path: 'u/cover.jpg', poster_path: 'u/poster.jpg' },
        deps({ publicUrl: () => null }),
      ),
    ).resolves.toBe('https://signed/u/poster.jpg?token=abc')

    await expect(
      resolveEventHeroUrl(
        { poster_path: 'u/poster.jpg', details: { media: { coverPath: 'u/crop.jpg' } } },
        deps({ signedUrl: async (p: string) => (p === 'u/poster.jpg' ? null : `https://signed/${p}`) }),
      ),
    ).resolves.toBe('https://signed/u/crop.jpg')
  })

  it('never signs a path it does not need — the cover short-circuits the private bucket', async () => {
    const signed: string[] = []
    await resolveEventHeroUrl(
      {
        cover_image_path: 'u/cover.jpg',
        poster_path: 'u/poster.jpg',
        details: { media: { coverPath: 'u/crop.jpg' } },
      },
      deps({
        signedUrl: async (p: string) => {
          signed.push(p)
          return `https://signed/${p}`
        },
      }),
    )
    expect(signed).toEqual([])
  })

  it('returns null for an event with no artwork', async () => {
    await expect(resolveEventHeroUrl({}, deps())).resolves.toBeNull()
    await expect(resolveEventHeroUrl(null, deps())).resolves.toBeNull()
  })
})
