import { describe, expect, it } from 'vitest'
import { REWARD_RULES, rulesMatching, getRewardRule, type MemberRewardSnapshot } from './rules'

const base: MemberRewardSnapshot = {
  profileId: 'p1',
  membershipTier: 'free',
  lifetimeRank: 'ghost',
  lifetimeZaps: 0,
  traits: {},
  tags: new Set(),
}

describe('reward rules registry', () => {
  it('every rule has a positive reward and a stable key', () => {
    const keys = REWARD_RULES.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length) // unique
    for (const r of REWARD_RULES) {
      expect(r.reward.amount).toBeGreaterThan(0)
      expect(['gems', 'zaps']).toContain(r.reward.kind)
    }
  })

  it('a blank member matches nothing', () => {
    expect(rulesMatching(base)).toHaveLength(0)
  })

  it('seasoned_agent matches a locked lifetime rank of Beacon or higher (past behavior)', () => {
    expect(rulesMatching({ ...base, lifetimeRank: 'signal' }).map((r) => r.key)).not.toContain('seasoned_agent')
    expect(rulesMatching({ ...base, lifetimeRank: 'beacon' }).map((r) => r.key)).toContain('seasoned_agent')
    expect(rulesMatching({ ...base, lifetimeRank: 'luminary' }).map((r) => r.key)).toContain('seasoned_agent')
  })

  it('og_beta matches the web_beta tag', () => {
    expect(rulesMatching({ ...base, tags: new Set(['web_beta']) }).map((r) => r.key)).toContain('og_beta')
  })

  it('supporter_thanks matches the supporter tier', () => {
    expect(rulesMatching({ ...base, membershipTier: 'supporter' }).map((r) => r.key)).toContain('supporter_thanks')
    expect(rulesMatching({ ...base, membershipTier: 'crew' }).map((r) => r.key)).not.toContain('supporter_thanks')
  })

  it('behavioral rules read the feature-store traits', () => {
    expect(rulesMatching({ ...base, traits: { engagement_depth: 'deep' } }).map((r) => r.key)).toContain('deep_engager')
    expect(rulesMatching({ ...base, traits: { interaction_days_30: 25 } }).map((r) => r.key)).toContain('loyal_30')
    expect(rulesMatching({ ...base, traits: { interaction_days_30: 19 } }).map((r) => r.key)).not.toContain('loyal_30')
    // string-typed trait value still coerces
    expect(rulesMatching({ ...base, traits: { interaction_days_30: '22' } }).map((r) => r.key)).toContain('loyal_30')
  })

  it('a member can match several rules at once', () => {
    const keys = rulesMatching({
      ...base,
      membershipTier: 'supporter',
      lifetimeRank: 'conduit',
      tags: new Set(['web_beta']),
      traits: { engagement_depth: 'deep' },
    }).map((r) => r.key)
    expect(keys).toEqual(expect.arrayContaining(['seasoned_agent', 'og_beta', 'supporter_thanks', 'deep_engager']))
  })

  it('getRewardRule looks up by key', () => {
    expect(getRewardRule('og_beta')?.reward.amount).toBe(50)
    expect(getRewardRule('nope')).toBeUndefined()
  })
})
