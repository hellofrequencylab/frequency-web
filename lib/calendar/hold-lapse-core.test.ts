import { describe, expect, it } from 'vitest'
import { dayInZone, hourInZone } from '@/lib/time/zone'
import {
  holdKey,
  holdMove,
  holdRecipient,
  holdReleasedCopy,
  holdWarningCopy,
  isNotifyHour,
  overdueCopy,
  overdueKey,
  overdueNudges,
  type OverdueTask,
} from './hold-lapse-core'

// WHEN A HOLD LAPSES AND WHO GETS NUDGED (calendar suite pass 8, LIVE-1709). The day is the Space's
// own, so these read the clock through the same zone helpers the sweep uses.

describe('a hold lapses in the Space\'s own time zone', () => {
  // 2026-10-29 16:30 UTC. Auckland is already Oct 30 05:30 (NZDT, +13); Honolulu is Oct 29 06:30 (-10).
  const instant = new Date('2026-10-29T16:30:00Z')

  it('reads a different local day for the same instant', () => {
    expect(dayInZone(instant, 'Pacific/Auckland')).toBe('2026-10-30')
    expect(dayInZone(instant, 'Pacific/Honolulu')).toBe('2026-10-29')
  })

  it('releases the Auckland hold that ended yesterday there while Honolulu still holds', () => {
    const holdUntil = '2026-10-29'
    expect(holdMove(holdUntil, dayInZone(instant, 'Pacific/Auckland'))).toBe('release')
    expect(holdMove(holdUntil, dayInZone(instant, 'Pacific/Honolulu'))).toBe('hold')
  })

  it('processes a Space only in its own 9 AM', () => {
    // 20:00 UTC on Oct 28 is 9 AM in Auckland (+13) and 1 PM in Los Angeles (PDT).
    const at = new Date('2026-10-28T20:00:00Z')
    expect(isNotifyHour(hourInZone(at, 'Pacific/Auckland'))).toBe(true)
    expect(isNotifyHour(hourInZone(at, 'America/Los_Angeles'))).toBe(false)
    // One hour earlier or later, nobody there is processed.
    expect(isNotifyHour(hourInZone(new Date('2026-10-28T19:00:00Z'), 'Pacific/Auckland'))).toBe(false)
    expect(isNotifyHour(hourInZone(new Date('2026-10-28T21:00:00Z'), 'Pacific/Auckland'))).toBe(false)
  })

  it('falls back to the platform home zone when a Space never named one', () => {
    expect(dayInZone(new Date('2026-10-29T02:00:00Z'), null)).toBe('2026-10-28')
  })
})

describe('holdMove', () => {
  it('holds through its last day, warns with one day left, releases the morning after', () => {
    expect(holdMove('2026-10-30', '2026-10-27')).toBe('hold')
    expect(holdMove('2026-10-30', '2026-10-28')).toBe('hold')
    expect(holdMove('2026-10-30', '2026-10-29')).toBe('warn')
    expect(holdMove('2026-10-30', '2026-10-30')).toBe('hold') // the last day still holds
    expect(holdMove('2026-10-30', '2026-10-31')).toBe('release')
    expect(holdMove('2026-10-30', '2026-12-01')).toBe('release') // a missed run catches up
  })

  it('crosses a month and a year end', () => {
    expect(holdMove('2026-11-01', '2026-10-31')).toBe('warn')
    expect(holdMove('2027-01-01', '2026-12-31')).toBe('warn')
    expect(holdMove('2026-12-31', '2027-01-01')).toBe('release')
  })

  it('moves nothing for no hold or a malformed day', () => {
    expect(holdMove(null, '2026-10-29')).toBe('hold')
    expect(holdMove('', '2026-10-29')).toBe('hold')
    expect(holdMove('soon', '2026-10-29')).toBe('hold')
    expect(holdMove('2026-10-30', 'today')).toBe('hold')
  })
})

describe('who hears about a hold', () => {
  it('prefers the Plan owner, then who started it, then the Space owner', () => {
    expect(holdRecipient({ ownerProfileId: 'o', createdBy: 'c' }, 's')).toBe('o')
    expect(holdRecipient({ ownerProfileId: null, createdBy: 'c' }, 's')).toBe('c')
    expect(holdRecipient({ ownerProfileId: null, createdBy: null }, 's')).toBe('s')
    expect(holdRecipient({ ownerProfileId: null, createdBy: null }, null)).toBeNull()
  })
})

describe('who gets the overdue nudge', () => {
  const today = '2026-10-29'
  const task = (over: Partial<OverdueTask>): OverdueTask => ({
    id: 't1',
    title: 'Book the hall',
    planTitle: 'Supper club',
    assigneeProfileId: 'mara',
    dueDay: '2026-10-28',
    status: 'open',
    ...over,
  })
  const everyone = () => true

  it('nudges the assignee of an open to-do that was due yesterday', () => {
    expect(overdueNudges([task({})], today, everyone)).toEqual([{ profileId: 'mara', titles: ['Book the hall'], planTitles: ['Supper club'] }])
  })

  it('leaves alone: still due, due today, long gone, done, unassigned, or no day', () => {
    const none = [
      task({ dueDay: '2026-10-29' }),
      task({ dueDay: '2026-10-30' }),
      task({ dueDay: '2026-10-25' }),
      task({ status: 'done' }),
      task({ assigneeProfileId: null }),
      task({ dueDay: null }),
    ]
    expect(overdueNudges(none, today, everyone)).toEqual([])
  })

  it('skips an assignee who does not work this Space', () => {
    expect(overdueNudges([task({}), task({ id: 't2', assigneeProfileId: 'guest' })], today, (id) => id === 'mara').map((n) => n.profileId)).toEqual(['mara'])
  })

  it('folds one person\'s slipped to-dos into one note and names each Plan once', () => {
    const out = overdueNudges([task({}), task({ id: 't2', title: 'Order mats' }), task({ id: 't3', assigneeProfileId: 'jo', planTitle: 'Market day' })], today, everyone)
    expect(out).toEqual([
      { profileId: 'mara', titles: ['Book the hall', 'Order mats'], planTitles: ['Supper club'] },
      { profileId: 'jo', titles: ['Book the hall'], planTitles: ['Market day'] },
    ])
  })

  it('reads yesterday across a month end', () => {
    expect(overdueNudges([task({ dueDay: '2026-10-31' })], '2026-11-01', everyone)).toHaveLength(1)
  })
})

describe('the words', () => {
  const all = [
    holdWarningCopy('Supper club'),
    holdReleasedCopy('Supper club'),
    overdueCopy({ titles: ['Book the hall'], planTitles: ['Supper club'] }),
    overdueCopy({ titles: ['a', 'b', 'c'], planTitles: ['Supper club'] }),
  ]

  it('says the plain thing, with no long dash, exclamation, cadence or health claim', () => {
    for (const c of all) {
      const text = `${c.title} ${c.body}`
      expect(text).not.toMatch(/[–—!]/)
      expect(text).not.toMatch(/\b(weekly|every week|each week|daily|guarantee)\b/i)
      expect(text).not.toMatch(/\b(unlock|transform|journey|tribe)\b/i)
    }
  })

  it('names the Plan or the to-do, and counts a pile', () => {
    expect(holdWarningCopy('Supper club').title).toBe('Your hold on "Supper club" runs out tomorrow')
    expect(holdReleasedCopy('Supper club').body).toContain('free again')
    expect(overdueCopy({ titles: ['Book the hall'], planTitles: ['Supper club'] }).title).toBe('"Book the hall" slipped past its day')
    expect(overdueCopy({ titles: ['a', 'b', 'c'], planTitles: ['Supper club'] }).title).toBe('3 to-dos slipped past their day')
  })

  it('clips a very long title to a lock-screen line', () => {
    expect(holdWarningCopy('x'.repeat(200)).title.length).toBeLessThan(100)
  })

  it('keys a send by the hold or the day, so a re-run is a no-op', () => {
    expect(holdKey('warn', 'p1', '2026-10-30')).toBe('plan-hold-warn:p1:2026-10-30')
    expect(holdKey('released', 'p1', '2026-10-30')).not.toBe(holdKey('warn', 'p1', '2026-10-30'))
    expect(overdueKey('mara', 's1', '2026-10-29')).toBe('plan-overdue:mara:s1:2026-10-29')
  })
})
