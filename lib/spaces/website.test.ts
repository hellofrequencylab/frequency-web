import { describe, expect, it } from 'vitest'
import {
  MAX_SITE_HERO_HEADING,
  MAX_SITE_HERO_TAGLINE,
  nextSiteHeroPreferences,
  readSiteHero,
  readWebsitePublished,
} from './website'

describe('readWebsitePublished', () => {
  it('only a literal true publishes', () => {
    expect(readWebsitePublished({ websitePublished: true })).toBe(true)
    expect(readWebsitePublished({ websitePublished: 'true' })).toBe(false)
    expect(readWebsitePublished(null)).toBe(false)
  })
})

describe('readSiteHero', () => {
  it('reads the website headline and intro, trimmed', () => {
    expect(readSiteHero({ siteHero: { heading: '  Fine, but *not okay.* ', tagline: ' Intro. ' } })).toEqual({
      heading: 'Fine, but *not okay.*',
      tagline: 'Intro.',
    })
  })
  it('drops blank and non-string fields so they fall back to the Hero settings', () => {
    expect(readSiteHero({ siteHero: { heading: '   ', tagline: 42 } })).toEqual({})
    expect(readSiteHero({ siteHero: { tagline: 'Only the intro.' } })).toEqual({ tagline: 'Only the intro.' })
  })
  it('caps the lengths', () => {
    const out = readSiteHero({ siteHero: { heading: 'h'.repeat(500), tagline: 't'.repeat(900) } })
    expect(out.heading).toHaveLength(MAX_SITE_HERO_HEADING)
    expect(out.tagline).toHaveLength(MAX_SITE_HERO_TAGLINE)
  })
  it('tolerates any shape', () => {
    expect(readSiteHero(null)).toEqual({})
    expect(readSiteHero('x')).toEqual({})
    expect(readSiteHero([])).toEqual({})
    expect(readSiteHero({})).toEqual({})
    expect(readSiteHero({ siteHero: 'Headline' })).toEqual({})
    expect(readSiteHero({ siteHero: ['Headline'] })).toEqual({})
  })
})

describe('nextSiteHeroPreferences', () => {
  it('writes only the siteHero node, sanitized', () => {
    const next = nextSiteHeroPreferences({ hero: { heading: 'Daniel' }, websitePublished: true }, { heading: ' Hi ', tagline: '' })
    expect(next).toEqual({ hero: { heading: 'Daniel' }, websitePublished: true, siteHero: { heading: 'Hi' } })
  })
  it('removes the node when both fields are blank', () => {
    expect(nextSiteHeroPreferences({ siteHero: { heading: 'Old' }, accent: 'x' }, { heading: ' ', tagline: '' })).toEqual({
      accent: 'x',
    })
  })
})

describe('the website hero eyebrow and buttons (LIVE-865)', () => {
  it('reads an eyebrow and two buttons, trimmed', () => {
    const out = readSiteHero({
      siteHero: {
        eyebrow: ' Men’s work · Year-round ',
        action: { label: ' Visit a Circle Night ', href: '/spaces/heart-on-fire/circles' },
        secondary: { label: 'How it works', href: 'https://example.com/how' },
      },
    })
    expect(out).toEqual({
      eyebrow: 'Men’s work · Year-round',
      action: { label: 'Visit a Circle Night', href: '/spaces/heart-on-fire/circles' },
      secondary: { label: 'How it works', href: 'https://example.com/how' },
    })
  })
  it('drops a button with no label, no link or an unsafe link', () => {
    for (const b of [
      { label: 'Go', href: '' },
      { label: '', href: '/spaces/x' },
      { label: 'Go', href: 'javascript:alert(1)' },
      { label: 'Go', href: '//evil.example' },
      { label: 'Go', href: '/a b' },
      'Go',
    ]) {
      expect(readSiteHero({ siteHero: { action: b } })).toEqual({})
    }
  })
  it('keeps a node that only has buttons, and removes an all-blank one', () => {
    const next = nextSiteHeroPreferences({}, { heading: '', action: { label: 'Go', href: '#join' } })
    expect(next).toEqual({ siteHero: { action: { label: 'Go', href: '#join' } } })
    expect(nextSiteHeroPreferences({ siteHero: { eyebrow: 'x' } }, { eyebrow: ' ', action: { label: '', href: '' } })).toEqual({})
  })
})
