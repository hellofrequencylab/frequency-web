import { describe, expect, it } from 'vitest'
import { FREE_SPOTLIGHT_LABEL, freeSpotlightHref } from './entry'

describe('freeSpotlightHref', () => {
  it('lands on /launch/start and carries where it was pressed', () => {
    const u = new URL(freeSpotlightHref('door', 'coaches-and-healers'), 'https://x.test')
    expect(u.pathname).toBe('/launch/start')
    expect(Object.fromEntries(u.searchParams)).toEqual({
      utm_source: 'site',
      utm_medium: 'door',
      utm_campaign: 'free-spotlight',
      utm_content: 'coaches-and-healers',
    })
  })

  it('leaves out a detail that is not a short slug', () => {
    expect(freeSpotlightHref('home')).not.toContain('utm_content')
    expect(freeSpotlightHref('theme', 'Not A Slug!')).not.toContain('utm_content')
  })

  it('keeps the one label', () => {
    expect(FREE_SPOTLIGHT_LABEL).toBe('Get a Free Spotlight')
  })
})

describe('freeSpotlightHref kit', () => {
  it('carries the kit it was pressed on, and only a slug', () => {
    expect(new URL(freeSpotlightHref('themes', 'temple', 'temple-kit'), 'https://x.test').searchParams.get('kit')).toBe('temple-kit')
    expect(freeSpotlightHref('themes', 'temple', 'Bad Kit!')).not.toContain('kit=')
  })
})
