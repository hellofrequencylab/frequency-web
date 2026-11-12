import { afterEach, describe, expect, it } from 'vitest'
import {
  isQuietSegment,
  quietDedupeKey,
  quietReengageEnabled,
  quietWindow,
  QUIET_CATCH_UP_DAYS,
  QUIET_SEGMENT_DAYS,
} from './quiet'

const NOW = new Date('2026-11-11T17:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

describe('quiet-member audiences (LIVE-2265)', () => {
  it('names exactly the 14, 30 and 60 day audiences', () => {
    expect(QUIET_SEGMENT_DAYS).toEqual({ quiet_14: 14, quiet_30: 30, quiet_60: 60 })
    expect(isQuietSegment('quiet_30')).toBe(true)
    expect(isQuietSegment('subscribed_members')).toBe(false)
    expect(isQuietSegment('toString')).toBe(false)
  })

  it('holds a week of catch-up past each line, and nothing newer than the line', () => {
    const w = quietWindow('quiet_14', NOW)
    expect(w.to).toBe(daysAgo(14))
    expect(w.from).toBe(daysAgo(14 + QUIET_CATCH_UP_DAYS))
    expect(quietWindow('quiet_60', NOW).to).toBe(daysAgo(60))
  })

  it('keeps one dedupe key per campaign and person', () => {
    expect(quietDedupeKey('c1', 'p1')).toBe('quiet-reengage:c1:p1')
    expect(quietDedupeKey('c1', 'p1')).not.toBe(quietDedupeKey('c2', 'p1'))
  })

  afterEach(() => {
    delete process.env.QUIET_REENGAGE_ENABLED
  })
  it('ships dark', () => {
    delete process.env.QUIET_REENGAGE_ENABLED
    expect(quietReengageEnabled()).toBe(false)
    process.env.QUIET_REENGAGE_ENABLED = 'on'
    expect(quietReengageEnabled()).toBe(true)
  })
})
