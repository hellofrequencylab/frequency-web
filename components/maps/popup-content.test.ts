// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { buildPopupContent } from './popup-content'

// THE POPUP CARD. Two things are being guarded here and only one of them is about looks.
//
// 🔴 THE INJECTION SURFACE. A pin's title, subtitle and detail are attacker-controlled: an event
// title is whatever a host typed, and an importer writes them in bulk. The card is built from nodes
// and `textContent`, so there is no HTML parse step to subvert. The ONE attribute that takes caller
// data is the image `src`, which is why `javascript:` and `data:` get their own tests.

const base = { id: 'p', lat: 0, lng: 0 }

describe('the card renders what the pin gives it', () => {
  it('renders nothing at all for a pin with no content', () => {
    expect(buildPopupContent({ ...base })).toBeNull()
  })

  it('renders a title, the when row, the where row and the link', () => {
    const el = buildPopupContent({
      ...base,
      title: 'Meld Community Cowork',
      subtitle: 'Wed, Aug 19 · and 7 more dates',
      detail: 'Vista, CA',
      href: '/events/meld',
      hrefLabel: 'See the event and its dates',
    })!
    const text = el.textContent ?? ''
    expect(text).toContain('Meld Community Cowork')
    expect(text).toContain('and 7 more dates')
    expect(text).toContain('Vista, CA')
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/events/meld')
    expect(el.querySelector('a')?.textContent).toBe('See the event and its dates')
  })

  it('renders the header image when the pin has one', () => {
    const el = buildPopupContent({
      ...base,
      title: 'Breathe Connect Expand',
      imageUrl: 'https://cdn.example.com/cover.jpg',
    })!
    const img = el.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toBe('https://cdn.example.com/cover.jpg')
    // Decorative: the title right beneath says the same thing, so announcing it twice is noise.
    expect(img!.getAttribute('alt')).toBe('')
    expect(img!.getAttribute('loading')).toBe('lazy')
  })

  it('renders no image band when there is no cover', () => {
    const el = buildPopupContent({ ...base, title: 'No cover' })!
    expect(el.querySelector('img')).toBeNull()
  })

  it('stacks in the /events card order: title, when, pills, where', () => {
    // Owner instruction 2026-08-13: match the /events grid. An earlier pass put the pills ON TOP,
    // reasoning that a member should read what the dot IS before its address. Right in isolation,
    // wrong in context — /events puts its pills under the time, and a card that leads with a pill
    // reads as a different component rather than the same one.
    const el = buildPopupContent({
      ...base,
      kind: 'event',
      title: 'Meld Community Cowork',
      subtitle: 'Wed, Aug 19 · and 7 more dates',
      detail: 'Vista, CA',
      badge: 'RSVP for address',
    })!
    const text = el.textContent ?? ''
    const at = (s: string) => text.indexOf(s)
    expect(at('Meld Community Cowork')).toBeLessThan(at('Wed, Aug 19'))
    expect(at('Wed, Aug 19')).toBeLessThan(at('Event'))
    expect(at('Event')).toBeLessThan(at('RSVP for address'))
    expect(at('RSVP for address')).toBeLessThan(at('Vista, CA'))
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────────
// 🔴 THE KIND PILL. An Event and a Circle at one venue are two different things and both keep their
// pin (owner ruling 2026-08-13), so the card has to say which one was opened — and must not change
// shape between them.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe('the card says WHAT you tapped', () => {
  const NOUNS: [kind: 'event' | 'circle' | 'space', noun: string][] = [
    ['event', 'Event'],
    ['circle', 'Circle'],
    ['space', 'Space'],
  ]

  for (const [kind, noun] of NOUNS) {
    it(`a ${kind} pin names itself "${noun}"`, () => {
      const el = buildPopupContent({ ...base, kind, title: 'Meld' })!
      expect(el.textContent).toContain(noun)
    })
  }

  it('paints the kind pill in the SAME token as the pin, so card and dot are one object', () => {
    const el = buildPopupContent({ ...base, kind: 'circle', title: 'Meld Coworking' })!
    const html = el.innerHTML
    // --color-signal is the circle token in lib/maps/pin-kinds.ts. If the pill stopped reading the
    // shared table, this is what would go.
    expect(html).toContain('--color-signal')
  })

  it('an Event and a Circle at one venue render the SAME stack, differing only in the pill', () => {
    const shape = (el: HTMLElement) => Array.from(el.children).map((c) => c.tagName).join(',')
    const event = buildPopupContent({
      ...base, kind: 'event', title: 'Meld - Community Cowork',
      subtitle: 'Wed, Aug 19 · and 7 more dates', detail: 'Vista, CA',
      imageUrl: 'https://cdn.example.com/a.jpg', href: '/events/meld', hrefLabel: 'See the event',
    })!
    const circle = buildPopupContent({
      ...base, kind: 'circle', title: 'Meld Coworking - Royal Temple',
      subtitle: '1 member', detail: 'Vista',
      imageUrl: 'https://cdn.example.com/b.jpg', href: '/circles/meld', hrefLabel: 'See the circle',
    })!
    expect(shape(event)).toBe(shape(circle))
  })

  it('the kind pill comes FIRST, then the caveat: what it is, then what is qualified', () => {
    const el = buildPopupContent({
      ...base, kind: 'space', title: 'Royal Temple', badge: 'Approximate area',
    })!
    const text = el.textContent ?? ''
    expect(text.indexOf('Space')).toBeLessThan(text.indexOf('Approximate area'))
  })

  it('marks the where row with the same pin glyph /events uses', () => {
    const el = buildPopupContent({ ...base, kind: 'event', title: 'ok', detail: 'Vista, CA' })!
    expect(el.textContent).toContain('\u{1F4CD}')
  })
})

describe('🔴 nothing a host typed can become markup', () => {
  it('a title that is an XSS payload renders as text', () => {
    const el = buildPopupContent({ ...base, title: '<img src=x onerror=alert(1)>' })!
    expect(el.querySelector('img')).toBeNull()
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('a script tag in the detail row renders as text', () => {
    const el = buildPopupContent({ ...base, title: 'ok', detail: '<script>alert(1)</script>' })!
    expect(el.querySelector('script')).toBeNull()
    expect(el.textContent).toContain('<script>alert(1)</script>')
  })

  it('a payload in the badge renders as text', () => {
    const el = buildPopupContent({ ...base, title: 'ok', badge: '<b>bold</b>' })!
    expect(el.querySelector('b')).toBeNull()
    expect(el.textContent).toContain('<b>bold</b>')
  })

  it('a payload in the subtitle renders as text', () => {
    const el = buildPopupContent({ ...base, title: 'ok', subtitle: '<iframe src=evil>' })!
    expect(el.querySelector('iframe')).toBeNull()
    expect(el.textContent).toContain('<iframe src=evil>')
  })
})

describe('🔴 the image src is the one attribute that takes caller data', () => {
  const REJECTED: [why: string, url: string][] = [
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL, the classic SVG-script vector', 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg=='],
    ['a vbscript: URL', 'vbscript:msgbox(1)'],
    ['an empty string', '   '],
  ]

  for (const [why, url] of REJECTED) {
    it(`${why} renders NO image rather than an unchecked one`, () => {
      const el = buildPopupContent({ ...base, title: 'ok', imageUrl: url })!
      expect(el.querySelector('img')).toBeNull()
    })
  }

  it('http and https both pass', () => {
    for (const url of ['https://cdn.example.com/a.jpg', 'http://cdn.example.com/a.jpg']) {
      const el = buildPopupContent({ ...base, title: 'ok', imageUrl: url })!
      expect(el.querySelector('img')?.getAttribute('src')).toBe(url)
    }
  })

  it('a relative path passes, because that is how a same-origin cover arrives', () => {
    const el = buildPopupContent({ ...base, title: 'ok', imageUrl: '/covers/a.jpg' })!
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/covers/a.jpg')
  })
})
