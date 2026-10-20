import { describe, expect, it } from 'vitest'
import { formatMeetCode, generateMeetCode, meetUrl, normalizeMeetCode, readTapReply, tapLine } from './codes'

describe('meet codes', () => {
  it('mints eight unambiguous characters', () => {
    for (let i = 0; i < 20; i++) expect(generateMeetCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
  })

  it('normalizes what a member typed', () => {
    expect(normalizeMeetCode(' k7q2 mx4p ')).toBe('K7Q2MX4P')
    expect(normalizeMeetCode('short')).toBeNull()
    expect(normalizeMeetCode(null)).toBeNull()
    expect(formatMeetCode('K7Q2MX4P')).toBe('K7Q2 MX4P')
    expect(meetUrl('K7Q2MX4P').endsWith('/meet/K7Q2MX4P')).toBe(true)
  })

  it('reads the writer reply and prints the line', () => {
    expect(readTapReply({ ok: true, reason: null, other_profile_id: 'p2' })).toEqual({ ok: true, reason: null, otherProfileId: 'p2' })
    expect(readTapReply({ ok: false, reason: 'daily_cap' }).reason).toBe('daily_cap')
    expect(readTapReply('nope').reason).toBe('failed')
    expect(tapLine({ ok: true, reason: null, otherProfileId: 'p2' }, 'Sam', 15)).toBe('You met Sam. 15 Zaps each.')
    expect(tapLine({ ok: false, reason: 'already_this_week', otherProfileId: 'p2' }, 'Sam', 15)).toBe('You and Sam already met this week.')
    expect(tapLine({ ok: false, reason: 'expired', otherProfileId: null }, null, 15)).toMatch(/expired/)
  })
})
