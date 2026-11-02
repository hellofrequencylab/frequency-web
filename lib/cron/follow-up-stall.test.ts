import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))
vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), info: vi.fn() } }))

import * as Sentry from '@sentry/nextjs'
import { assessFollowUp, reportFollowUp } from './follow-up-stall'

describe('follow-up stall', () => {
  it('nothing due is idle, not a failure', () => {
    expect(assessFollowUp({ due: 0, delivered: 0 })).toBe('idle')
  })
  it('due work with something delivered is ok', () => {
    expect(assessFollowUp({ due: 5, delivered: 2 })).toBe('ok')
  })
  it('due work with nothing delivered is stalled', () => {
    expect(assessFollowUp({ due: 3, delivered: 0 })).toBe('stalled')
  })
  it('captures only a stalled pass', () => {
    reportFollowUp('space-drips', { due: 0, delivered: 0 })
    reportFollowUp('space-drips', { due: 4, delivered: 4 })
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
    reportFollowUp('journey-drips', { due: 2, delivered: 0 })
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
  })
})
