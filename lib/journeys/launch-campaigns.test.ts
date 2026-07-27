import { describe, it, expect } from 'vitest'
import {
  deriveLaunchSchedule,
  buildLaunchCampaignDrafts,
  LAUNCH_CAMPAIGN_KEYS,
} from './launch-campaigns'

const now = new Date('2026-08-01T12:00:00Z')
const DAY = 86_400_000
const HOUR = 3_600_000

describe('deriveLaunchSchedule (ADR-840)', () => {
  it('anchors kickoff on the play window and last call two days before it', () => {
    const windowStart = new Date(now.getTime() + 20 * DAY).toISOString()
    const s = deriveLaunchSchedule(now, windowStart)
    expect(s.kickoff.toISOString()).toBe(windowStart)
    expect(s.last_call.getTime()).toBe(s.kickoff.getTime() - 2 * DAY)
    expect(s.announce.getTime()).toBe(now.getTime() + HOUR)
    expect(s.enrollment_open.getTime()).toBe(now.getTime() + 2 * DAY)
  })

  it('falls back to a 14-day runway when there is no window', () => {
    const s = deriveLaunchSchedule(now, null)
    expect(s.kickoff.getTime()).toBe(now.getTime() + 14 * DAY)
    expect(s.last_call.getTime()).toBe(now.getTime() + 12 * DAY)
  })

  it('treats a past window like no window (the runway)', () => {
    const past = new Date(now.getTime() - 5 * DAY).toISOString()
    const s = deriveLaunchSchedule(now, past)
    expect(s.kickoff.getTime()).toBe(now.getTime() + 14 * DAY)
  })

  it('stays strictly ascending and all-future even against a window at the door', () => {
    const soon = new Date(now.getTime() + 2 * HOUR).toISOString()
    const s = deriveLaunchSchedule(now, soon)
    const times = LAUNCH_CAMPAIGN_KEYS.map((k) => s[k].getTime())
    expect(times[0]).toBeGreaterThan(now.getTime())
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1] + HOUR)
    }
  })

  it('ignores an unparseable window', () => {
    const s = deriveLaunchSchedule(now, 'not-a-date')
    expect(s.kickoff.getTime()).toBe(now.getTime() + 14 * DAY)
  })
})

describe('buildLaunchCampaignDrafts (ADR-840)', () => {
  const input = {
    title: 'Morning Momentum',
    journeyUrl: 'https://frequencylocal.com/journeys/morning-momentum',
    windowStartsAt: new Date(now.getTime() + 10 * DAY).toISOString(),
  }

  it('returns the four-send series in order, dates matching the schedule', () => {
    const drafts = buildLaunchCampaignDrafts(input, now)
    expect(drafts.map((d) => d.key)).toEqual([...LAUNCH_CAMPAIGN_KEYS])
    const schedule = deriveLaunchSchedule(now, input.windowStartsAt)
    for (const d of drafts) expect(d.sendAt).toBe(schedule[d.key].toISOString())
  })

  it('carries the title and link into every draft, with a subject on each', () => {
    const drafts = buildLaunchCampaignDrafts(input, now)
    for (const d of drafts) {
      expect(d.subject.length).toBeGreaterThan(0)
      expect(d.body).toContain(input.journeyUrl)
      expect(`${d.subject} ${d.body}`).toContain('Morning Momentum')
    }
  })

  it('keeps the copy inside the voice canon (no em dashes)', () => {
    for (const d of buildLaunchCampaignDrafts(input, now)) {
      expect(d.subject).not.toContain('—')
      expect(d.body).not.toContain('—')
    }
  })

  it('handles a blank title without producing broken copy', () => {
    const drafts = buildLaunchCampaignDrafts({ ...input, title: '  ' }, now)
    expect(drafts[0].subject).toContain('your Journey')
  })
})
