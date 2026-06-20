import { describe, it, expect } from 'vitest'
import {
  normalizeSplash,
  normalizeLinks,
  isValidSplash,
  primarySplashLink,
  emptySplash,
  type Splash,
} from './splash'
import { renderSplashPage } from './splash-render'

// SPLASH (ENTITY-SPACES-BUILD §C, Phase 2). All network-free (the splash shape is pure). Locked here:
//   1. normalizeSplash is fail-closed: a headingless / non-object splash is null; heading/blurb are
//      trimmed + capped; an unsafe image url drops to null; links are validated.
//   2. normalizeLinks drops a link missing a label or a valid url; caps at 5.
//   3. primarySplashLink is links[0] (or null); isValidSplash mirrors normalizeSplash.
//   4. renderSplashPage escapes owner content (no injection) and resolves relative urls.

describe('normalizeLinks (pure, fail-closed)', () => {
  it('keeps links with a label + a valid url, capped at 5', () => {
    const links = normalizeLinks([
      { label: 'Book', url: 'https://example.com' },
      { label: 'Home', url: '/spaces/x' },
      { label: 'no url' }, // dropped
      { label: '', url: 'https://x.com' }, // dropped (no label)
      { label: 'bad', url: 'javascript:alert(1)' }, // dropped (not http/https/relative)
    ])
    expect(links).toEqual([
      { label: 'Book', url: 'https://example.com' },
      { label: 'Home', url: '/spaces/x' },
    ])
  })

  it('returns [] for a non-array', () => {
    expect(normalizeLinks('nope')).toEqual([])
    expect(normalizeLinks(undefined)).toEqual([])
  })

  it('caps the link count at 5', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, url: 'https://x.com' }))
    expect(normalizeLinks(many)).toHaveLength(5)
  })
})

describe('normalizeSplash (pure, fail-closed)', () => {
  it('accepts a valid splash and trims its fields', () => {
    const s = normalizeSplash({
      heading: '  Welcome in  ',
      blurb: '  A line.  ',
      imageUrl: 'https://example.com/b.jpg',
      links: [{ label: 'Book', url: 'https://example.com' }],
    })
    expect(s).toEqual({
      heading: 'Welcome in',
      blurb: 'A line.',
      imageUrl: 'https://example.com/b.jpg',
      links: [{ label: 'Book', url: 'https://example.com' }],
    })
  })

  it('drops a splash with no heading', () => {
    expect(normalizeSplash({ heading: '   ', blurb: 'x' })).toBeNull()
    expect(normalizeSplash({ blurb: 'x' })).toBeNull()
  })

  it('returns null for a non-object', () => {
    expect(normalizeSplash('nope')).toBeNull()
    expect(normalizeSplash(null)).toBeNull()
    expect(normalizeSplash(['a'])).toBeNull()
  })

  it('drops an unsafe image url to null but keeps a valid heading', () => {
    const s = normalizeSplash({ heading: 'Hi', imageUrl: 'data:text/html,<script>' })
    expect(s?.imageUrl).toBeNull()
    expect(s?.heading).toBe('Hi')
  })

  it('defaults blurb/image/links sensibly when absent', () => {
    expect(normalizeSplash({ heading: 'Hi' })).toEqual({
      heading: 'Hi',
      blurb: null,
      imageUrl: null,
      links: [],
    })
  })
})

describe('isValidSplash + primarySplashLink (pure)', () => {
  it('isValidSplash mirrors normalizeSplash', () => {
    expect(isValidSplash({ heading: 'Hi' })).toBe(true)
    expect(isValidSplash({ blurb: 'no heading' })).toBe(false)
  })

  it('primarySplashLink returns links[0] or null', () => {
    const s = normalizeSplash({
      heading: 'Hi',
      links: [
        { label: 'A', url: 'https://a.com' },
        { label: 'B', url: 'https://b.com' },
      ],
    })!
    expect(primarySplashLink(s)).toEqual({ label: 'A', url: 'https://a.com' })
    expect(primarySplashLink(normalizeSplash({ heading: 'Hi' })!)).toBeNull()
    expect(primarySplashLink(null)).toBeNull()
  })

  it('emptySplash is not valid (no heading) until a heading is set', () => {
    expect(isValidSplash(emptySplash())).toBe(false)
  })
})

describe('renderSplashPage (pure)', () => {
  const base: Splash = {
    heading: 'Welcome',
    blurb: 'Come on in.',
    imageUrl: null,
    links: [{ label: 'Book', url: '/book' }],
  }

  it('renders the heading, blurb, and a resolved link', () => {
    const html = renderSplashPage(base, 'https://fq.app')
    expect(html).toContain('<h1')
    expect(html).toContain('Welcome')
    expect(html).toContain('Come on in.')
    expect(html).toContain('href="https://fq.app/book"')
  })

  it('escapes owner content (no injection)', () => {
    const evil: Splash = {
      heading: '<script>alert(1)</script>',
      blurb: 'a " quote',
      imageUrl: null,
      links: [{ label: '<b>x</b>', url: 'https://x.com' }],
    }
    const html = renderSplashPage(evil, 'https://fq.app')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  })

  it('omits the image tag when there is no image', () => {
    expect(renderSplashPage(base, 'https://fq.app')).not.toContain('<img')
  })
})
