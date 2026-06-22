import { describe, it, expect } from 'vitest'
import {
  parseRecord,
  liveElapsedSeconds,
  LIVE_SESSION_MAX_AGE_MS,
  type LiveSessionRecord,
} from './live-session'

const base = (over: Partial<LiveSessionRecord> = {}): LiveSessionRecord => ({
  kind: 'movement',
  startedAt: 1_000_000,
  pausedAt: null,
  practiceId: 'p1',
  resumeFromSec: 0,
  secondsTarget: 1200,
  savedAt: 1_000_000,
  setup: { config: { mode: 'walk', walkMinutes: 20, walkIntervalMin: 0 } },
  ...over,
})

describe('liveElapsedSeconds', () => {
  it('counts wall-clock seconds from startedAt to now while running', () => {
    const rec = base({ startedAt: 100_000, pausedAt: null })
    expect(liveElapsedSeconds(rec, 100_000 + 90_000)).toBe(90) // 90s later
  })

  it('freezes at the pause moment when paused', () => {
    const rec = base({ startedAt: 100_000, pausedAt: 100_000 + 30_000 })
    // now is much later, but a paused run only counts up to pausedAt
    expect(liveElapsedSeconds(rec, 100_000 + 999_000)).toBe(30)
  })

  it('never returns negative (clock skew guard)', () => {
    const rec = base({ startedAt: 100_000, pausedAt: null })
    expect(liveElapsedSeconds(rec, 50_000)).toBe(0)
  })
})

describe('parseRecord', () => {
  it('returns null for missing input', () => {
    expect(parseRecord(null, 0)).toBeNull()
    expect(parseRecord('', 0)).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseRecord('{not json', 0)).toBeNull()
  })

  it('returns null when required fields are missing or wrong-typed', () => {
    expect(parseRecord(JSON.stringify({ kind: 'movement' }), 0)).toBeNull()
    expect(parseRecord(JSON.stringify(base({ practiceId: 123 as unknown as string })), 1_000_000)).toBeNull()
    expect(parseRecord(JSON.stringify({ ...base(), kind: 'bogus' }), 1_000_000)).toBeNull()
  })

  it('parses a valid record within the freshness window', () => {
    const rec = base({ savedAt: 1_000_000 })
    const out = parseRecord(JSON.stringify(rec), 1_000_000 + 60_000)
    expect(out).not.toBeNull()
    expect(out?.practiceId).toBe('p1')
    expect(out?.setup).toEqual(rec.setup)
  })

  it('drops a record older than the max age (abandoned overnight)', () => {
    const rec = base({ savedAt: 1_000_000 })
    const out = parseRecord(JSON.stringify(rec), 1_000_000 + LIVE_SESSION_MAX_AGE_MS + 1)
    expect(out).toBeNull()
  })

  it('keeps a record exactly at the max-age boundary', () => {
    const rec = base({ savedAt: 1_000_000 })
    const out = parseRecord(JSON.stringify(rec), 1_000_000 + LIVE_SESSION_MAX_AGE_MS)
    expect(out).not.toBeNull()
  })

  it('accepts a paused record (pausedAt is a number) and an open-ended one (secondsTarget null)', () => {
    const paused = parseRecord(JSON.stringify(base({ pausedAt: 1_050_000 })), 1_100_000)
    expect(paused?.pausedAt).toBe(1_050_000)
    const open = parseRecord(JSON.stringify(base({ secondsTarget: null })), 1_000_000)
    expect(open?.secondsTarget).toBeNull()
  })
})
