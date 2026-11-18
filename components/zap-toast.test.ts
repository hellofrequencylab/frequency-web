// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { showZapToast, consumeLocalEcho } from './zap-toast'

// LIVE-671: a reward the earning tab already toasted is not toasted again when the same reward
// arrives over the member's Realtime channel; a reward from another device is.

describe('reward echo suppression', () => {
  it('swallows the broadcast of a reward this tab just showed, once', () => {
    showZapToast({ amount: 12, label: 'Checked in' })
    expect(consumeLocalEcho('zaps', 12)).toBe(true)
    expect(consumeLocalEcho('zaps', 12)).toBe(false)
  })

  it('lets a reward from another device through', () => {
    expect(consumeLocalEcho('zaps', 7)).toBe(false)
    expect(consumeLocalEcho('gems', 25)).toBe(false)
  })

  it('matches on kind and amount, and forgets after the window', () => {
    showZapToast({ amount: 5, kind: 'gems' })
    expect(consumeLocalEcho('zaps', 5)).toBe(false)
    expect(consumeLocalEcho('gems', 5, Date.now() + 60_000)).toBe(false)
    expect(consumeLocalEcho('gems', 5)).toBe(true)
  })
})

// 2026-11-18: one reward, one toast. The daily check-in raised its own pill AND, a moment later,
// its Realtime echo labelled "Earned on another device", on the same phone.
describe('one reward, one toast', () => {
  const remote = { amount: 2, kind: 'gems' as const, label: 'For checking in today', source: 'remote' as const }
  const local = { amount: 2, kind: 'gems' as const, title: 'Welcome back', source: 'local' as const }

  it('a local copy upgrades a remote one that got there first', async () => {
    const { mergeReward } = await import('./zap-toast')
    const a = mergeReward([], remote, 1000, 1)
    const b = mergeReward(a, local, 1500, 2)
    expect(b).toHaveLength(1)
    expect(b[0].reward.title).toBe('Welcome back')
  })

  it('drops a remote copy that lands after the local one, and keeps a genuinely new reward', async () => {
    const { mergeReward } = await import('./zap-toast')
    const a = mergeReward([], local, 1000, 1)
    expect(mergeReward(a, remote, 1500, 2)).toHaveLength(1)
    expect(mergeReward(a, { ...remote, amount: 5 }, 1500, 2)).toHaveLength(2)
    expect(mergeReward(a, remote, 1000 + 60_000, 2)).toHaveLength(2)
  })

  it('a claimed reward (the Mindless reveal) swallows its echo', async () => {
    const { claimReward } = await import('./zap-toast')
    claimReward('zaps', 40)
    expect(consumeLocalEcho('zaps', 40)).toBe(true)
  })

  it('never claims another device', async () => {
    const { rewardLabel } = await import('./zap-toast')
    expect(rewardLabel('daily_login')).toBe('For checking in today')
    expect(rewardLabel('practice_logged_heavy')).toBe('Practice logged')
    expect(rewardLabel(undefined)).toBe('Reward earned')
  })
})
