import { describe, expect, it } from 'vitest'
import { normalizeVoteEmail, signTimeVoteToken, timeVotePath, verifyTimeVoteToken } from './time-vote-token'

process.env.TIME_VOTE_SECRET = 'test-time-vote-secret'

const PLAN = '0d6f6f0e-1f7b-4a7e-9c55-6e2f3b1c9a10'
const NOW = Date.UTC(2026, 10, 24, 12)

describe('the Find a time email link', () => {
  it('round-trips the Plan and the lower-cased address', () => {
    const t = signTimeVoteToken(PLAN, ' Venue@Example.com ', { now: NOW })!
    expect(verifyTimeVoteToken(t, NOW)).toMatchObject({ planId: PLAN, email: 'venue@example.com' })
    expect(timeVotePath(t)).toBe(`/find-a-time/${t}`)
  })

  it('refuses an expired link', () => {
    const t = signTimeVoteToken(PLAN, 'a@b.co', { now: NOW, ttlDays: 1 })!
    expect(verifyTimeVoteToken(t, NOW + 2 * 86_400_000)).toBeNull()
  })

  it('refuses a link edited to another address, another Plan or another expiry', () => {
    const t = signTimeVoteToken(PLAN, 'a@b.co', { now: NOW })!
    const [plan, em, exp, sig] = t.split('.')
    const other = Buffer.from('c@d.co').toString('base64url')
    expect(verifyTimeVoteToken([plan, other, exp, sig].join('.'), NOW)).toBeNull()
    expect(verifyTimeVoteToken(['1d6f6f0e-1f7b-4a7e-9c55-6e2f3b1c9a10', em, exp, sig].join('.'), NOW)).toBeNull()
    expect(verifyTimeVoteToken([plan, em, String(Number(exp) + 1), sig].join('.'), NOW)).toBeNull()
  })

  it('refuses junk and will not mint for a bad address or Plan', () => {
    for (const junk of [null, '', 'a.b.c.d', 42, 'x'.repeat(800)]) expect(verifyTimeVoteToken(junk, NOW)).toBeNull()
    expect(signTimeVoteToken(PLAN, 'not an email')).toBeNull()
    expect(signTimeVoteToken('nope', 'a@b.co')).toBeNull()
    expect(normalizeVoteEmail('A@B.CO')).toBe('a@b.co')
  })
})
