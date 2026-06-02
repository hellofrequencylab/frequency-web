import { describe, it, expect } from 'vitest'
import { deterministicWinback, filterByConsent, type WinbackCandidate } from './winback'

const candidates: WinbackCandidate[] = [
  { profileId: 'a', email: 'a@example.com', displayName: 'Ada' },
  { profileId: 'b', email: 'b@example.com', displayName: 'Ben' },
  { profileId: 'c', email: 'c@example.com', displayName: null },
]

describe('filterByConsent (the AI operator consent gate)', () => {
  it('drops members who have opted out of lifecycle email', async () => {
    // b has opted out; a and c are opted in.
    const consents = async (id: string) => id !== 'b'
    const kept = await filterByConsent(candidates, consents)
    expect(kept.map((c) => c.profileId)).toEqual(['a', 'c'])
  })

  it('keeps everyone when all consent', async () => {
    const kept = await filterByConsent(candidates, async () => true)
    expect(kept).toHaveLength(3)
  })

  it('proposes to no one when all have opted out', async () => {
    const kept = await filterByConsent(candidates, async () => false)
    expect(kept).toHaveLength(0)
  })

  it('preserves order and never mutates the input', async () => {
    const kept = await filterByConsent(candidates, async (id) => id !== 'a')
    expect(kept.map((c) => c.profileId)).toEqual(['b', 'c'])
    expect(candidates).toHaveLength(3) // unchanged
  })
})

describe('deterministicWinback (always-available fallback)', () => {
  it('produces a non-empty subject and body with the member name', () => {
    const d = deterministicWinback('Ada')
    expect(d.subject.trim()).not.toBe('')
    expect(d.body).toContain('Ada')
  })

  it('falls back to a friendly lead when the name is blank', () => {
    expect(deterministicWinback('').body).toContain('there')
    expect(deterministicWinback('   ').body).toContain('there')
  })
})
