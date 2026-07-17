import { describe, it, expect } from 'vitest'
import { buildBusinessStarter, pickLoomCover } from './business-starter'

describe('buildBusinessStarter', () => {
  it('personalizes the prompts from what-you-do and never writes finished copy', () => {
    const s = buildBusinessStarter({ name: 'River Yoga', whatYouDo: 'I teach beginner yoga' })
    expect(s.aboutShort).toContain('I teach beginner yoga')
    expect(s.aboutShort).toContain('River Yoga')
    // The story is a prompt that tells them to replace it, not prose written for them.
    expect(s.profileData.about).toMatch(/write yours/i)
    expect(s.tagline).toMatch(/your one-line hook/i)
  })

  it('normalizes website and social handles into full URLs, only when given', () => {
    const s = buildBusinessStarter({
      name: 'River Yoga',
      whatYouDo: 'yoga',
      website: 'riveryoga.com',
      instagram: '@riveryoga',
      facebook: 'https://facebook.com/riveryoga',
    })
    expect(s.profileData.website).toBe('https://riveryoga.com')
    expect(s.profileData.socials).toEqual([
      { platform: 'instagram', url: 'https://instagram.com/riveryoga' },
      { platform: 'facebook', url: 'https://facebook.com/riveryoga' },
    ])
  })

  it('omits links that were left blank', () => {
    const s = buildBusinessStarter({ name: 'Solo', whatYouDo: 'stuff' })
    expect(s.profileData.website).toBeUndefined()
    expect(s.profileData.socials).toBeUndefined()
  })

  it('drops an unusable website (no dot, not a url)', () => {
    const s = buildBusinessStarter({ name: 'X', whatYouDo: 'y', website: 'notaurl' })
    expect(s.profileData.website).toBeUndefined()
  })

  it('always picks a real Loom cover, deterministically per name', () => {
    const a = pickLoomCover('River Yoga')
    const b = pickLoomCover('River Yoga')
    expect(a).toBe(b)
    expect(a).toMatch(/^\/images\/site\/.+\.jpg$/)
  })

  it('still produces usable prompts when what-you-do is blank', () => {
    const s = buildBusinessStarter({ name: 'Blank Co', whatYouDo: '' })
    expect(s.aboutShort).toContain('Blank Co')
    expect(s.tagline.length).toBeGreaterThan(0)
    expect(s.profileData.about).toMatch(/write yours/i)
  })
})
