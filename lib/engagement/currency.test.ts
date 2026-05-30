import { describe, it, expect } from 'vitest'
import { currencyForSource } from '@/lib/engagement/currency'

describe('currencyForSource', () => {
  it('internal/on-platform sources earn gems', () => {
    expect(currencyForSource('web')).toBe('gems')
    expect(currencyForSource('system')).toBe('gems')
  })

  it('external / in-person sources earn zaps', () => {
    for (const s of ['task', 'qr', 'nfc', 'geo', 'p2p'] as const) {
      expect(currencyForSource(s)).toBe('zaps')
    }
  })
})
