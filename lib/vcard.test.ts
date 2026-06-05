import { describe, it, expect } from 'vitest'
import { parseVcard, buildVcf, DEFAULT_VCARD, type VcardProfile } from './vcard'

const PROFILE: VcardProfile = {
  displayName: 'Dana Vista',
  handle: 'dana',
  bio: 'Walks & coffee',
  avatarUrl: 'https://x.com/a.png',
  profileUrl: 'https://frequencylocal.com/people/dana',
}

describe('parseVcard', () => {
  it('defaults to disabled with no fields', () => {
    expect(parseVcard(null)).toEqual(DEFAULT_VCARD)
    expect(parseVcard({}).enabled).toBe(false)
  })
  it('validates email and normalizes the website to https', () => {
    expect(parseVcard({ email: 'nope' }).email).toBeNull()
    expect(parseVcard({ email: 'd@x.com' }).email).toBe('d@x.com')
    expect(parseVcard({ website: 'dana.example' }).website).toBe('https://dana.example')
    expect(parseVcard({ website: 'http://dana.example' }).website).toBe('http://dana.example')
  })
})

describe('buildVcf', () => {
  it('returns null when disabled', () => {
    expect(buildVcf(PROFILE, { ...DEFAULT_VCARD, enabled: false })).toBeNull()
  })

  it('includes only opted-in fields + always the name, handle, and profile URL', () => {
    const vcf = buildVcf(PROFILE, { ...DEFAULT_VCARD, enabled: true, email: 'd@x.com', includeAvatar: true })!
    expect(vcf).toContain('BEGIN:VCARD')
    expect(vcf).toContain('FN:Dana Vista')
    expect(vcf).toContain('NICKNAME:dana')
    expect(vcf).toContain('URL:https://frequencylocal.com/people/dana')
    expect(vcf).toContain('EMAIL;TYPE=INTERNET:d@x.com')
    expect(vcf).toContain('PHOTO;VALUE=URI:https://x.com/a.png')
    expect(vcf).not.toContain('TEL') // phone wasn't shared
    expect(vcf).toContain('END:VCARD')
  })

  it('omits the photo when includeAvatar is off', () => {
    const vcf = buildVcf(PROFILE, { ...DEFAULT_VCARD, enabled: true, includeAvatar: false })!
    expect(vcf).not.toContain('PHOTO')
  })

  it('escapes vCard special characters', () => {
    const vcf = buildVcf({ ...PROFILE, displayName: 'A; B, C' }, { ...DEFAULT_VCARD, enabled: true })!
    expect(vcf).toContain('FN:A\\; B\\, C')
  })
})
