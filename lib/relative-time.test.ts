import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { relativeTime } from './utils'

// ONE RELATIVE-TIME RULE (B5 dead-code sweep D2, 2026-09-04).
//
// The three admin intake lists (business, event and listing seeders) each carried a private
// `timeAgo` that ROUNDED where lib/utils.ts relativeTime FLOORS, and counted days forever where
// relativeTime hands back a date after a week. Measured side by side on the same inputs:
//
//   elapsed | relativeTime | the copies
//   90 min  | 1h ago       | 2h ago
//   23.6 h  | 23h ago      | 1d ago
//   6.6 d   | 6d ago       | 7d ago
//   400 d   | a short date | 400d ago
//
// An intake that was staged 23 hours ago read "1d ago" on those three screens and "23h ago" on
// every other. The three now read through relativeTime; these are the worked cases, pinned, plus
// the source-shape pin that the copies stay gone.

const NOW = new Date('2026-09-04T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('relativeTime floors, and dates past a week', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('90 minutes is "1h ago" (the copies said 2h)', () => {
    expect(relativeTime(ago(90 * MIN))).toBe('1h ago')
  })

  it('23.6 hours is "23h ago" (the copies said 1d)', () => {
    expect(relativeTime(ago(23.6 * HOUR))).toBe('23h ago')
  })

  it('6.6 days is "6d ago" (the copies said 7d)', () => {
    expect(relativeTime(ago(6.6 * DAY))).toBe('6d ago')
  })

  it('400 days is a short date, never "400d ago"', () => {
    const label = relativeTime(ago(400 * DAY))
    expect(label).not.toMatch(/ago$/)
    // "Jul 31" shape: month abbreviation + day. The exact day depends on the runtime zone, the
    // shape does not.
    expect(label).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)
  })

  it('the near end is unchanged: under a minute, minutes, hours', () => {
    expect(relativeTime(ago(0))).toBe('just now')
    expect(relativeTime(ago(59_999))).toBe('just now')
    expect(relativeTime(ago(3 * MIN))).toBe('3m ago')
    expect(relativeTime(ago(59 * MIN + 59_999))).toBe('59m ago')
    expect(relativeTime(ago(2 * HOUR))).toBe('2h ago')
  })

  it('an unparseable stamp is empty, not the string "Invalid Date"', () => {
    // The copies guarded this and relativeTime did not; the guard moved with the callers.
    expect(relativeTime('not a date')).toBe('')
    expect(relativeTime('')).toBe('')
  })
})

describe('the three intake lists read through relativeTime and carry no rounding copy', () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')
  for (const screen of ['business-seeder', 'event-seeder', 'listing-seeder']) {
    it(`app/(main)/admin/${screen}/intake-list.tsx`, () => {
      const src = read(`app/(main)/admin/${screen}/intake-list.tsx`)
      expect(src).toContain("import { relativeTime } from '@/lib/utils'")
      expect(src).toContain('{relativeTime(it.updatedAt)}')
      expect(src).not.toContain('function timeAgo')
      expect(src).not.toContain('Math.round')
    })
  }
})
