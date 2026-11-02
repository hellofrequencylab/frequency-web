import { describe, expect, it } from 'vitest'
import { EMPTY_PAGE, MAX_PAGE_LINKS, readPageSettings, safeWebUrl, validatePageSettings, visibleLinks } from './link-in-bio'

describe('safeWebUrl', () => {
  it('keeps http and https, adds https to a bare domain', () => {
    expect(safeWebUrl('https://maya.com/book')).toBe('https://maya.com/book')
    expect(safeWebUrl('maya.com')).toBe('https://maya.com/')
  })
  it('refuses script and data schemes', () => {
    expect(safeWebUrl('javascript:alert(1)')).toBeNull()
    expect(safeWebUrl('data:text/html,x')).toBeNull()
    expect(safeWebUrl('nope')).toBeNull()
  })
})

describe('validatePageSettings', () => {
  it('is unconfigured for nothing and for junk', () => {
    expect(readPageSettings({})).toBe(EMPTY_PAGE)
    expect(validatePageSettings('x')).toBe(EMPTY_PAGE)
  })
  it('drops bad links, titles from the host, one highlight, unique ids', () => {
    const s = validatePageSettings({
      links: [
        { id: 'a', title: '  Book  ', url: 'maya.com/book', highlight: true },
        { id: 'a', title: '', url: 'https://www.spotify.com/x', highlight: true, icon: 'music' },
        { id: 'c', title: 'bad', url: 'javascript:1' },
      ],
    })
    expect(s.configured).toBe(true)
    expect(s.links.map((l) => l.title)).toEqual(['Book', 'spotify.com'])
    expect(new Set(s.links.map((l) => l.id)).size).toBe(2)
    expect(s.links.filter((l) => l.highlight)).toHaveLength(1)
    expect(s.links[1].icon).toBe('music')
  })
  it('caps links and defaults the switch on', () => {
    const links = Array.from({ length: MAX_PAGE_LINKS + 5 }, (_, i) => ({ id: `i${i}`, url: 'https://a.com' }))
    const s = validatePageSettings({ links })
    expect(s.links).toHaveLength(MAX_PAGE_LINKS)
    expect(s.frequencyFeatures).toBe(true)
    expect(validatePageSettings({ frequencyFeatures: false }).frequencyFeatures).toBe(false)
  })
  it('validates socials: one per kind, mailto for email', () => {
    const s = validatePageSettings({
      socials: [
        { kind: 'instagram', url: 'instagram.com/maya' },
        { kind: 'instagram', url: 'instagram.com/other' },
        { kind: 'email', url: 'maya@maya.com' },
        { kind: 'email', url: 'nope' },
        { kind: 'myspace', url: 'a.com' },
      ],
    })
    expect(s.socials).toEqual([
      { kind: 'instagram', url: 'https://instagram.com/maya' },
      { kind: 'email', url: 'mailto:maya@maya.com' },
    ])
  })
})

describe('visibleLinks', () => {
  const base = { id: 'a', title: 't', url: 'https://a.com/', icon: 'link' as const, hidden: false, highlight: false }
  const now = new Date('2026-11-10T12:00:00Z')
  it('hides hidden and out-of-window links', () => {
    const out = visibleLinks(
      [
        base,
        { ...base, id: 'b', hidden: true },
        { ...base, id: 'c', startsAt: '2026-12-01T00:00:00Z' },
        { ...base, id: 'd', endsAt: '2026-11-01T00:00:00Z' },
        { ...base, id: 'e', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-20T00:00:00Z' },
      ],
      now,
    )
    expect(out.map((l) => l.id)).toEqual(['a', 'e'])
  })
})
