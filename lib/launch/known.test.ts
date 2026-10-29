import { describe, expect, it } from 'vitest'
import { httpsAddress, prefillAnswers } from './known'

const profile = { displayName: 'Daniel Tyack', bio: 'Prepare to be treasured.', website: 'https://danieltyack.com' }

describe('what the person already has fills the launch form', () => {
  it('keeps what the Spotlight already says and fills the rest from the Space', () => {
    const out = prefillAnswers({ name: 'Daniel', line: '', link: '' }, { name: 'Daniel Tyack', tagline: 'Emotional Alchemy', about: 'About.', domain: 'danieltyack.com' }, profile)
    expect(out).toEqual({ name: 'Daniel', line: 'Emotional Alchemy', link: 'https://danieltyack.com/' })
  })
  it('falls back to the first about line, then the profile bio, for the one-liner', () => {
    expect(prefillAnswers(null, { name: 'S', tagline: '', about: 'First line\nSecond', domain: null }, profile).line).toBe('First line')
    expect(prefillAnswers(null, { name: 'S', tagline: null, about: '', domain: null }, profile).line).toBe('Prepare to be treasured.')
  })
  it('uses the profile website when the Space has none, and the profile alone for a new Space', () => {
    expect(prefillAnswers(null, { name: 'S', tagline: 't', about: '', domain: null }, profile).link).toBe('https://danieltyack.com/')
    expect(prefillAnswers(null, null, profile)).toEqual({ name: 'Daniel Tyack', line: 'Prepare to be treasured.', link: 'https://danieltyack.com/' })
  })
  it('never leaves something that is not a web address in the link', () => {
    expect(httpsAddress('javascript:alert(1)')).toBe('')
    expect(httpsAddress('')).toBe('')
    expect(httpsAddress('mysite.com')).toBe('https://mysite.com/')
  })
})
