import { describe, it, expect } from 'vitest'
import {
  isoWeek,
  lifecycleStage,
  rfmScore,
  rfmRecency,
  rfmFrequency,
  computeTraits,
  type MemberStats,
} from './compute'

const DAY = 86_400_000
const NOW = Date.parse('2026-06-03T12:00:00Z')
const ago = (days: number) => new Date(NOW - days * DAY).toISOString()

const base: MemberStats = {
  createdAt: ago(5),
  lastEventAt: null,
  firstVerifiedPracticeAt: null,
  distinctActiveDays30: 0,
  verifiedPractices7d: 0,
  eventCount30d: 0,
}

describe('isoWeek', () => {
  it('labels the ISO week', () => {
    expect(isoWeek('2026-06-03T00:00:00Z')).toBe('2026-W23')
    expect(isoWeek('2026-01-01T00:00:00Z')).toBe('2026-W01')
  })
})

describe('lifecycleStage', () => {
  it('new — recent joiner, no activity yet', () => {
    expect(lifecycleStage({ ...base, lastEventAt: null, createdAt: ago(5) }, NOW)).toBe('new')
  })
  it('dormant — old joiner who never acted, or long silent', () => {
    expect(lifecycleStage({ ...base, lastEventAt: null, createdAt: ago(60) }, NOW)).toBe('dormant')
    expect(lifecycleStage({ ...base, lastEventAt: ago(40) }, NOW)).toBe('dormant')
  })
  it('at_risk — active 14–30d ago', () => {
    expect(lifecycleStage({ ...base, lastEventAt: ago(20) }, NOW)).toBe('at_risk')
  })
  it('engaged — activated and active within 7d', () => {
    expect(lifecycleStage({ ...base, lastEventAt: ago(3), firstVerifiedPracticeAt: ago(10) }, NOW)).toBe('engaged')
  })
  it('activated — has activated but cooling (8–14d)', () => {
    expect(lifecycleStage({ ...base, lastEventAt: ago(10), firstVerifiedPracticeAt: ago(20) }, NOW)).toBe('activated')
  })
})

describe('rfm', () => {
  it('recency drops with time since last activity', () => {
    expect(rfmRecency({ ...base, lastEventAt: ago(1) }, NOW)).toBe(5)
    expect(rfmRecency({ ...base, lastEventAt: ago(40) }, NOW)).toBe(1)
    expect(rfmRecency({ ...base, lastEventAt: null }, NOW)).toBe(1)
  })
  it('frequency rises with 30d volume', () => {
    expect(rfmFrequency({ ...base, eventCount30d: 0 })).toBe(1)
    expect(rfmFrequency({ ...base, eventCount30d: 25 })).toBe(5)
  })
  it('score packs recency in tens, frequency in units', () => {
    expect(rfmScore({ ...base, lastEventAt: ago(1), eventCount30d: 25 }, NOW)).toBe(55)
  })
})

describe('computeTraits', () => {
  it('emits every registry-governed computed trait with the right type', () => {
    const out = computeTraits({ ...base, lastEventAt: ago(2), firstVerifiedPracticeAt: ago(5), distinctActiveDays30: 3, verifiedPractices7d: 2, eventCount30d: 6 }, NOW)
    const byKey = Object.fromEntries(out.map((t) => [t.key, t]))
    expect(Object.keys(byKey).sort()).toEqual(
      ['activation_date', 'days_active_30', 'join_cohort', 'last_active_at', 'lifecycle_stage', 'rfm_score', 'wam_status'],
    )
    expect(byKey.wam_status.value).toBe(true)
    expect(byKey.days_active_30.value).toBe(3)
    expect(byKey.lifecycle_stage.value).toBe('engaged')
  })

  it('handles a brand-new member with no events', () => {
    const byKey = Object.fromEntries(computeTraits(base, NOW).map((t) => [t.key, t.value]))
    expect(byKey.last_active_at).toBeNull()
    expect(byKey.activation_date).toBeNull()
    expect(byKey.wam_status).toBe(false)
    expect(byKey.lifecycle_stage).toBe('new')
  })
})
