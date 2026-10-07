import { describe, expect, it } from 'vitest'
import { SITE_HERO_LEDE_MAX, siteHeroCopy, siteHeroLede } from './site-hero-copy'

describe('siteHeroLede', () => {
  it('keeps a short description whole', () => {
    expect(siteHeroLede('  Start  here. ')).toBe('Start here.')
  })
  it('stops at a sentence when the description runs long', () => {
    const first = 'Daniel works with people who feel stuck, using a technique called Emotional Alchemy to help them through.'
    const lede = siteHeroLede(`${first} ${'More words follow here. '.repeat(10)}`)
    expect(lede?.startsWith(first)).toBe(true)
    expect(lede!.length).toBeLessThanOrEqual(SITE_HERO_LEDE_MAX)
    expect(lede!.endsWith('.')).toBe(true)
  })
  it('cuts one long sentence at a word with an ellipsis', () => {
    const lede = siteHeroLede('word '.repeat(80))
    expect(lede!.endsWith('…')).toBe(true)
    expect(lede!.length).toBeLessThanOrEqual(SITE_HERO_LEDE_MAX + 1)
  })
  it('is null with no description', () => {
    expect(siteHeroLede(null)).toBeNull()
  })
})

describe('siteHeroCopy', () => {
  const base = { brandName: 'Daniel Tyack', tagline: 'Therapy in Boise.', about: 'I help people. Then more.' }
  it('leads with the website headline and intro over the Hero settings', () => {
    const copy = siteHeroCopy({
      ...base,
      siteHero: { heading: 'Fine, but *not okay.*', tagline: 'A longer intro line.' },
      hero: { heading: 'Daniel Tyack', tagline: 'Short line.' },
    })
    expect(copy).toEqual({ title: 'Fine, but *not okay.*', lede: 'A longer intro line.' })
  })
  it('falls back to the Hero settings when the website fields are unset', () => {
    expect(siteHeroCopy({ ...base, siteHero: {}, hero: { heading: 'Hero name', tagline: 'Hero line.' } })).toEqual({
      title: 'Hero name',
      lede: 'Hero line.',
    })
  })
  it('falls back to the brand name, tagline, then the description', () => {
    expect(siteHeroCopy({ ...base, siteHero: {}, hero: {} })).toEqual({ title: 'Daniel Tyack', lede: 'Therapy in Boise.' })
    expect(siteHeroCopy({ ...base, tagline: null, siteHero: { heading: 'Hi' }, hero: {} })).toEqual({
      title: 'Hi',
      lede: 'I help people. Then more.',
    })
  })
})
