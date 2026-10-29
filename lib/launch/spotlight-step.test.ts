import { describe, expect, it } from 'vitest'
import { readSpaceSpotlight } from '../spaces/spotlight'
import { handleCandidate, handleFor, parseSpotlightAnswers, publishedSpotlightPreferences } from './spotlight-step'

describe('the Spotlight step answers', () => {
  it('needs a name and one line, and keeps the link only when it is an https address', () => {
    expect(parseSpotlightAnswers({ name: '  ', line: 'x' })).toEqual({ error: 'Add the name people know you by.' })
    expect(parseSpotlightAnswers({ name: 'Mara', line: '' })).toEqual({ error: 'Add one line about what you do, in your own words.' })
    expect(parseSpotlightAnswers({ name: 'Mara', line: 'Breathwork in Encinitas', link: 'mara.example.com' })).toEqual({
      name: 'Mara',
      line: 'Breathwork in Encinitas',
      link: 'https://mara.example.com/',
    })
    for (const link of ['javascript:alert(1)', 'http://mara.example.com', 'not a link', 'https://localhost']) {
      expect(parseSpotlightAnswers({ name: 'Mara', line: 'x', link })).toMatchObject({ link: '' })
    }
  })

  it('caps the length and collapses whitespace', () => {
    const out = parseSpotlightAnswers({ name: 'a\n\n  b'.padEnd(200, 'z'), line: 'y'.repeat(900) })
    expect('error' in out).toBe(false)
    if ('error' in out) return
    expect(out.name.length).toBe(80)
    expect(out.name.startsWith('a b')).toBe(true)
    expect(out.line.length).toBe(300)
  })
})

describe('the Space handle', () => {
  it('is a safe slug from the name and varies on a later attempt', () => {
    expect(handleFor('Mara Ríos Breathwork!')).toBe('mara-rios-breathwork')
    expect(handleFor('Mara Ríos Breathwork!', 1)).toBe('mara-rios-breathwork-2')
    expect(handleFor('!!')).toBe('my-space')
    expect(handleFor('Al')).toBe('al-space')
    expect(handleFor('x'.repeat(100))).toHaveLength(32)
  })

  it('uses the handle a visitor claimed first, with a suffix on later tries, and the name\'s own otherwise', () => {
    expect(handleCandidate('Mara Rios', 0, 'saltwater')).toBe('saltwater')
    expect(handleCandidate('Mara Rios', 1, 'saltwater')).toBe('saltwater-2')
    expect(handleCandidate('Mara Rios', 2, 'x'.repeat(40))).toHaveLength(38)
    for (const bad of [undefined, null, '', 'Bad Handle', '-x', 'a']) expect(handleCandidate('Mara Rios', 0, bad)).toBe('mara-rios')
    expect(handleCandidate('Mara Rios', 1, undefined)).toBe('mara-rios-2')
  })
})

describe('the published Spotlight', () => {
  const a = { name: 'Mara', line: 'Breathwork in Encinitas', link: 'https://mara.example.com/' }

  it('is published, in the person\'s own words, and keeps the Space\'s other preferences', () => {
    const prefs = publishedSpotlightPreferences({ megaTheme: { niche: 'coaches' } }, a)
    expect(prefs.megaTheme).toEqual({ niche: 'coaches' })
    const spot = readSpaceSpotlight(prefs)
    expect(spot.published).toBe(true)
    expect(spot.layout?.rows?.map((r) => r.cells[0][0])).toEqual(['heading', 'text', 'links'])
    expect(spot.layout?.content?.heading).toEqual({ text: 'Mara' })
    expect(spot.layout?.content?.text).toEqual({ text: 'Breathwork in Encinitas' })
    expect(spot.layout?.content?.links).toEqual({ items: [{ label: 'mara.example.com', url: 'https://mara.example.com/' }] })
  })

  it('leaves the link block out when there is no link', () => {
    const spot = readSpaceSpotlight(publishedSpotlightPreferences({}, { ...a, link: '' }))
    expect(spot.layout?.rows?.map((r) => r.cells[0][0])).toEqual(['heading', 'text'])
  })
})
