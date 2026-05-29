import { describe, it, expect } from 'vitest'
import { nextRetry } from '@/lib/queue/outbox'

describe('nextRetry (outbox retry policy)', () => {
  it('fails at or past the attempt cap', () => {
    expect(nextRetry(5, 5).status).toBe('failed')
    expect(nextRetry(6, 5).status).toBe('failed')
  })

  it('retries with exponential backoff under the cap', () => {
    expect(nextRetry(1, 5)).toEqual({ status: 'pending', delayMs: 60_000 })
    expect(nextRetry(2, 5)).toEqual({ status: 'pending', delayMs: 120_000 })
    expect(nextRetry(3, 5)).toEqual({ status: 'pending', delayMs: 240_000 })
  })
})
