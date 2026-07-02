import { describe, it, expect } from 'vitest'
import { readProfileData, withProfileData, mergeField } from './profile-data'

describe('readProfileData', () => {
  it('returns empty for a missing / malformed blob', () => {
    expect(readProfileData(undefined)).toEqual({})
    expect(readProfileData({})).toEqual({})
    expect(readProfileData({ profileData: 'nope' })).toEqual({})
    expect(readProfileData({ profileData: [] })).toEqual({})
  })

  it('reads + trims the known business fields, dropping empties', () => {
    const data = readProfileData({
      profileData: {
        address: '  12 Main St  ',
        hours: 'Mon-Fri 9-5',
        phone: '555-1000',
        email: 'hi@x.co',
        website: 'https://x.co',
        rating: '4.8',
        ratingCount: '126 reviews',
        about: 'Our story.',
        unknownKey: 'ignored',
        phoneBlank: '   ',
      },
    })
    expect(data).toEqual({
      address: '12 Main St',
      hours: 'Mon-Fri 9-5',
      phone: '555-1000',
      email: 'hi@x.co',
      website: 'https://x.co',
      rating: '4.8',
      ratingCount: '126 reviews',
      about: 'Our story.',
    })
  })

  it('keeps offerings with a title, drops blurb-only / empty rows, and trims', () => {
    const data = readProfileData({
      profileData: {
        offerings: [
          { title: '  Coaching  ', blurb: '  60 min  ' },
          { title: 'Workshop' }, // blurb optional
          { blurb: 'no title' }, // dropped
          { title: '   ' }, // dropped
        ],
      },
    })
    expect(data.offerings).toEqual([
      { title: 'Coaching', blurb: '60 min' },
      { title: 'Workshop' },
    ])
  })

  it('keeps only valid, known-platform socials with a url', () => {
    const data = readProfileData({
      profileData: {
        socials: [
          { platform: 'LinkedIn', url: 'https://linkedin.com/x' }, // normalized to lowercase
          { platform: 'facebook', url: '' }, // no url -> dropped
          { platform: 'myspace', url: 'https://myspace.com/x' }, // unknown -> dropped
          { url: 'https://no-platform.co' }, // no platform -> dropped
        ],
      },
    })
    expect(data.socials).toEqual([{ platform: 'linkedin', url: 'https://linkedin.com/x' }])
  })
})

describe('withProfileData', () => {
  it('merges a patch, normalizes, and is immutable', () => {
    const prefs = { coverSize: 'hero', profileData: { address: 'Old', phone: '555' } }
    const next = withProfileData(prefs, { address: 'New' })
    expect(readProfileData(next)).toEqual({ address: 'New', phone: '555' })
    // sibling preferences keys are preserved
    expect((next as { coverSize?: string }).coverSize).toBe('hero')
    // input untouched
    expect(prefs.profileData.address).toBe('Old')
  })

  it('drops the profileData node entirely when everything is cleared', () => {
    const prefs = { profileData: { address: 'Old' }, coverSize: 'header' }
    const next = withProfileData(prefs, { address: '' })
    expect('profileData' in next).toBe(false)
    expect((next as { coverSize?: string }).coverSize).toBe('header')
  })
})

describe('mergeField (single source of truth)', () => {
  it('prefers the CENTRAL value over the block prop', () => {
    expect(mergeField('block address', 'central address')).toBe('central address')
  })
  it('falls back to the block prop only when central is empty', () => {
    expect(mergeField('block address', '')).toBe('block address')
    expect(mergeField('block address', undefined)).toBe('block address')
    expect(mergeField('block address', '   ')).toBe('block address')
  })
  it('is undefined when neither is set', () => {
    expect(mergeField('', undefined)).toBeUndefined()
    expect(mergeField(undefined, undefined)).toBeUndefined()
  })
})
