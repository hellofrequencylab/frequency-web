import { describe, expect, it } from 'vitest'
import { freeHumanToday } from '@/lib/sites/free-human-events'

describe('freeHumanToday', () => {
  it('keeps the Pacific day through the evening, when UTC has already turned', () => {
    expect(freeHumanToday(new Date('2026-11-03T03:30:00Z'))).toBe('2026-11-02')
  })
  it('turns at Pacific midnight', () => {
    expect(freeHumanToday(new Date('2026-11-03T08:30:00Z'))).toBe('2026-11-03')
  })
})
