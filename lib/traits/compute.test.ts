import { describe, it, expect } from 'vitest'
import {
  isoWeek,
  lifecycleStage,
  rfmScore,
  rfmRecency,
  rfmFrequency,
  computeTraits,
  computeBehavioralTraits,
  engagementDepth,
  type MemberStats,
  type InteractionStats,
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

const ibase: InteractionStats = {
  lastInteractionAt: null, interactionCount30: 0, interactionDays30: 0,
  surfacesTouched30: 0, dwellMs30: 0, sessions30: 0, scrollDepthAvg: 0,
}

describe('engagementDepth (behavioral feature store · PI.2)', () => {
  it('bands by active days + dwell', () => {
    expect(engagementDepth(ibase)).toBe('idle')
    expect(engagementDepth({ ...ibase, interactionDays30: 2, dwellMs30: 2 * 60_000 })).toBe('shallow')
    expect(engagementDepth({ ...ibase, interactionDays30: 4, dwellMs30: 5 * 60_000 })).toBe('moderate')
    expect(engagementDepth({ ...ibase, interactionDays30: 1, dwellMs30: 12 * 60_000 })).toBe('moderate') // dwell alone lifts it
    expect(engagementDepth({ ...ibase, interactionDays30: 10, dwellMs30: 40 * 60_000 })).toBe('deep')
  })
})

describe('computeBehavioralTraits', () => {
  it('emits every behavioral trait with the right type + units', () => {
    const out = computeBehavioralTraits({
      lastInteractionAt: '2026-06-08T00:00:00.000Z',
      interactionCount30: 120, interactionDays30: 9, surfacesTouched30: 14,
      dwellMs30: 35 * 60_000, sessions30: 11, scrollDepthAvg: 62.4,
    })
    const byKey = Object.fromEntries(out.map((t) => [t.key, t]))
    expect(Object.keys(byKey).sort()).toEqual(
      ['dwell_minutes_30', 'engagement_depth', 'interaction_count_30', 'interaction_days_30',
       'last_interaction_at', 'scroll_depth_avg', 'sessions_30', 'surfaces_touched_30'],
    )
    expect(byKey.dwell_minutes_30.value).toBe(35) // ms → minutes
    expect(byKey.scroll_depth_avg.value).toBe(62) // rounded
    expect(byKey.engagement_depth.value).toBe('deep')
    expect(byKey.last_interaction_at.type).toBe('timestamp')
  })

  it('zeroes out for a member with no interactions', () => {
    const byKey = Object.fromEntries(computeBehavioralTraits(ibase).map((t) => [t.key, t.value]))
    expect(byKey.interaction_count_30).toBe(0)
    expect(byKey.engagement_depth).toBe('idle')
    expect(byKey.last_interaction_at).toBeNull()
  })
})
