import { describe, expect, it } from 'vitest'
import { SITE_HERO_LEDE_MAX, siteHeroEyebrow, siteHeroLede } from './site-hero-copy'

describe('siteHeroEyebrow', () => {
  it('joins the tagline and the town', () => {
    expect(siteHeroEyebrow('Emotional Alchemy', 'Encinitas')).toBe('Emotional Alchemy · Encinitas')
  })
  it('keeps whichever exists, or null', () => {
    expect(siteHeroEyebrow(null, ' Encinitas ')).toBe('Encinitas')
    expect(siteHeroEyebrow('  ', undefined)).toBeNull()
  })
})

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
