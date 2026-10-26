import { describe, it, expect } from 'vitest'
import { emptySpaceCoachProfile, parseSpaceCoachProfile, validateSpaceCoachProfile } from './coach-profile'
describe('owner-declared Space coach profile', () => {
  it('does not infer preferences from unrelated Space data', () => {
    expect(parseSpaceCoachProfile({ privateNotes: 'not a source' })).toEqual(emptySpaceCoachProfile())
    expect(parseSpaceCoachProfile(null)).toEqual(emptySpaceCoachProfile())
  })
  it('keeps only bounded declared context, strips null bytes and ignores authorization input', () => {
    const profile = parseSpaceCoachProfile({ goals: '  Return visits\u0000 ', audience: 'x'.repeat(1500), role: 'owner', autoSend: true })
    expect(profile.goals).toBe('Return visits')
    expect(profile.audience.length).toBe(1200)
    expect(profile).not.toHaveProperty('role')
    expect(profile).not.toHaveProperty('autoSend')
  })
  it('refuses invalid/oversized saves instead of silently losing input', () => {
    expect(validateSpaceCoachProfile({ ...emptySpaceCoachProfile(), examples: 'x'.repeat(2401) })).toContain('2401')
    expect(validateSpaceCoachProfile({ ...emptySpaceCoachProfile(), goals: false })).not.toBeNull()
    expect(validateSpaceCoachProfile(emptySpaceCoachProfile())).toBeNull()
  })
})
