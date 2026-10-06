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
