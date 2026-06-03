import { describe, it, expect } from 'vitest'
import { latestByScope, type ConsentRecord } from './consent'
import { isExpired } from './retention'
import { defaultGranted } from './scopes'

describe('latestByScope', () => {
  it('takes the most recent record per scope', () => {
    const records: ConsentRecord[] = [
      { scope: 'email_marketing', granted: true, created_at: '2026-06-01T00:00:00Z' },
      { scope: 'email_marketing', granted: false, created_at: '2026-06-02T00:00:00Z' }, // newer → wins
      { scope: 'ai_memory', granted: true, created_at: '2026-06-01T00:00:00Z' },
    ]
    const m = latestByScope(records)
    expect(m.get('email_marketing')).toBe(false)
    expect(m.get('ai_memory')).toBe(true)
    expect(m.has('analytics')).toBe(false)
  })

  it('is empty for no records', () => {
    expect(latestByScope([]).size).toBe(0)
  })
})

describe('defaultGranted', () => {
  it('product telemetry opts out by default; marketing opts in', () => {
    expect(defaultGranted('ai_memory')).toBe(true)
    expect(defaultGranted('analytics')).toBe(true)
    expect(defaultGranted('email_marketing')).toBe(false)
    expect(defaultGranted('unknown_scope')).toBe(false) // fail-closed
  })
})

describe('isExpired', () => {
  const NOW = Date.parse('2026-06-03T12:00:00Z')
  it('null never expires', () => {
    expect(isExpired(null, NOW)).toBe(false)
  })
  it('past expiry is expired; future is not', () => {
    expect(isExpired('2026-06-01T00:00:00Z', NOW)).toBe(true)
    expect(isExpired('2026-07-01T00:00:00Z', NOW)).toBe(false)
  })
})
