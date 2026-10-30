import { describe, expect, it } from 'vitest'
import { personalProfileWrite, personalSpotlightHref } from './personal'

const stored = { displayName: 'Old Name', handle: 'ada', bio: 'old bio', website: 'https://old.example', phone: '555', city: 'Encinitas' }
const answers = { name: 'Ada Lovelace', line: 'I teach small yoga classes.', link: 'https://ada.example/' }

describe('personalProfileWrite', () => {
  it('changes only the name, bio and website', () => {
    expect(personalProfileWrite(stored, answers)).toEqual({
      displayName: 'Ada Lovelace',
      handle: 'ada',
      bio: 'I teach small yoga classes.',
      avatarUrl: '',
      phone: '555',
      city: 'Encinitas',
      website: 'https://ada.example/',
    })
  })
  it('keeps a missing phone or city empty rather than inventing one', () => {
    const w = personalProfileWrite({ ...stored, phone: null, city: null }, answers)
    expect(w?.phone).toBe('')
    expect(w?.city).toBe('')
  })
  it('never touches the avatar', () => {
    expect(personalProfileWrite(stored, answers)?.avatarUrl).toBe('')
  })
  it('does nothing for a profile with no handle', () => {
    expect(personalProfileWrite({ ...stored, handle: null }, answers)).toBeNull()
    expect(personalProfileWrite({ ...stored, handle: '  ' }, answers)).toBeNull()
    expect(personalProfileWrite(null, answers)).toBeNull()
  })
})

describe('personalSpotlightHref', () => {
  it('is the public Spotlight of a handle', () => {
    expect(personalSpotlightHref('ada')).toBe('/spotlight/ada')
    expect(personalSpotlightHref(null)).toBeNull()
    expect(personalSpotlightHref('')).toBeNull()
  })
})
