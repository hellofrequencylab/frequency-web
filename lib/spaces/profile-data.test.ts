import { describe, it, expect } from 'vitest'
import {
  readProfileData,
  withProfileData,
  mergeField,
  formatServicePrice,
  formatServiceDuration,
  formatServiceDeposit,
  formatServicePackage,
  isServiceListed,
} from './profile-data'

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

  it('parses the full service pricing + visibility fields, coercing fail-safe', () => {
    const data = readProfileData({
      profileData: {
        offerings: [
          {
            title: 'Deep tissue session',
            blurb: 'One hour',
            price: '120', // numeric string -> coerced
            currency: 'usd', // -> uppercased
            priceModel: 'from',
            durationMinutes: 60.4, // -> rounded
            deposit: 40,
            recurring: 'monthly',
            packageCount: 6,
            slidingScaleMin: 40,
            slidingScaleMax: 80,
            visibility: 'listed',
          },
          {
            title: 'Garbage fields dropped',
            price: -5, // negative -> dropped
            currency: 'dollars', // invalid code -> dropped
            priceModel: 'barter', // unknown enum -> dropped
            recurring: 'daily', // unknown enum -> dropped
            visibility: 'secret', // unknown enum -> dropped
          },
        ],
      },
    })
    expect(data.offerings).toEqual([
      {
        title: 'Deep tissue session',
        blurb: 'One hour',
        price: 120,
        currency: 'USD',
        priceModel: 'from',
        durationMinutes: 60,
        deposit: 40,
        recurring: 'monthly',
        packageCount: 6,
        slidingScaleMin: 40,
        slidingScaleMax: 80,
        visibility: 'listed',
      },
      // Every malformed field dropped; only the title survives.
      { title: 'Garbage fields dropped' },
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

describe('formatServicePrice', () => {
  it('formats a plain fixed price', () => {
    expect(formatServicePrice({ title: 'x', price: 120 })).toBe('$120')
    expect(formatServicePrice({ title: 'x', price: 79.5 })).toBe('$79.50')
  })
  it('prefixes a "from" price', () => {
    expect(formatServicePrice({ title: 'x', price: 80, priceModel: 'from' })).toBe('from $80')
  })
  it('adds a recurring cadence suffix', () => {
    expect(formatServicePrice({ title: 'x', price: 60, recurring: 'monthly' })).toBe('$60/mo')
    expect(formatServicePrice({ title: 'x', price: 25, recurring: 'weekly' })).toBe('$25/wk')
    expect(formatServicePrice({ title: 'x', price: 25, recurring: 'once' })).toBe('$25')
  })
  it('formats a sliding-scale range (no em dash)', () => {
    const label = formatServicePrice({ title: 'x', slidingScaleMin: 40, slidingScaleMax: 80 })
    expect(label).toBe('$40-$80 sliding scale')
    expect(label).not.toContain('—') // never an em dash
  })
  it('handles free + contact models', () => {
    expect(formatServicePrice({ title: 'x', priceModel: 'free' })).toBe('Free')
    expect(formatServicePrice({ title: 'x', priceModel: 'contact' })).toBe('Contact for pricing')
  })
  it('respects a non-USD currency code', () => {
    expect(formatServicePrice({ title: 'x', price: 50, currency: 'EUR' })).toBe('€50')
  })
  it('returns null when there is no pricing signal', () => {
    expect(formatServicePrice({ title: 'x' })).toBeNull()
    expect(formatServicePrice({ title: 'x', blurb: 'no price' })).toBeNull()
  })
})

describe('service meta helpers', () => {
  it('formats duration in hours + minutes', () => {
    expect(formatServiceDuration(45)).toBe('45 min')
    expect(formatServiceDuration(60)).toBe('1 hr')
    expect(formatServiceDuration(90)).toBe('1 hr 30 min')
    expect(formatServiceDuration(undefined)).toBeNull()
    expect(formatServiceDuration(0)).toBeNull()
  })
  it('formats a deposit + package, or null when unset', () => {
    expect(formatServiceDeposit({ title: 'x', deposit: 40 })).toBe('$40 deposit to book')
    expect(formatServiceDeposit({ title: 'x' })).toBeNull()
    expect(formatServicePackage({ title: 'x', packageCount: 6 })).toBe('6-session package')
    expect(formatServicePackage({ title: 'x', packageCount: 1 })).toBeNull()
    expect(formatServicePackage({ title: 'x' })).toBeNull()
  })
  it('treats unset / listed as public and private as hidden', () => {
    expect(isServiceListed({ title: 'x' })).toBe(true)
    expect(isServiceListed({ title: 'x', visibility: 'listed' })).toBe(true)
    expect(isServiceListed({ title: 'x', visibility: 'private' })).toBe(false)
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
