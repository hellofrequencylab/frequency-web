import { describe, expect, it } from 'vitest'
import { pencilDoneLine, planPencilItIn, planQuickAdd, quickEntry } from './pencil-it-in'

const today = '2026-10-21'
const base = { title: '  Supper   club ', dates: ['2026-10-23', '2026-10-30'], startMin: 1140, durMin: 120, holdDays: 7, playbookId: 'sound-bath', timeZone: 'America/Los_Angeles' }

describe('planPencilItIn', () => {
  it('holds each date as a timed pencil and ends the hold a week out', () => {
    const r = planPencilItIn(base, today)
    if ('error' in r) throw new Error(r.error)
    expect(r.data.title).toBe('Supper club')
    expect(r.data.holdUntil).toBe('2026-10-28')
    const entries = r.data.entries('plan-1')
    expect(entries.map((e) => e.startDate)).toEqual(['2026-10-23', '2026-10-30'])
    expect(entries[0]).toMatchObject({ kind: 'pencil', stage: 'pencil', allDay: false, startTime: '19:00', endTime: '21:00', planId: 'plan-1', blocksTime: false, showPublicly: false })
  })
  it('counts the playbook back from the earliest date, with its phase and half hour', () => {
    const r = planPencilItIn({ ...base, dates: ['2026-11-06', '2026-10-30'] }, today)
    if ('error' in r) throw new Error(r.error)
    expect(r.data.playbookName).toBe('Sound bath')
    expect(r.data.todos.map((t) => [t.title, t.dueAt.slice(0, 10), t.dueOffsetDays, t.phase, t.estMinutes])).toEqual([
      ['Confirm practitioner', '2026-10-09', -21, 'Before', 30],
      ['Post to socials', '2026-10-16', -14, 'Before', 30],
      ['Order mats', '2026-10-23', -7, 'Before', 30],
      ['Set up the room', '2026-10-30', 0, 'Day of', 30],
      ['Thank-you note to guests', '2026-10-31', 1, 'After', 30],
    ])
  })
  it('adds nothing for Start blank or no playbook, and no hold when none is asked', () => {
    for (const playbookId of ['', 'blank']) {
      const r = planPencilItIn({ ...base, playbookId, holdDays: 0 }, today)
      if ('error' in r) throw new Error(r.error)
      expect(r.data.todos).toEqual([])
      expect(r.data.playbookName).toBeNull()
      expect(r.data.holdUntil).toBeNull()
    }
  })
  it('makes an all day pencil when there is no start, and stops a late one at 11:59 PM', () => {
    const allDay = planPencilItIn({ ...base, startMin: null }, today)
    if ('error' in allDay) throw new Error(allDay.error)
    expect(allDay.data.entries(null)[0]).toMatchObject({ allDay: true, startTime: null, endTime: null })
    const late = planPencilItIn({ ...base, startMin: 1380, durMin: 240 }, today)
    if ('error' in late) throw new Error(late.error)
    expect(late.data.entries(null)[0]).toMatchObject({ startTime: '23:00', endTime: '23:59' })
  })
  it('refuses what cannot be held, in plain words', () => {
    const err = (over: Record<string, unknown>) => {
      const r = planPencilItIn({ ...base, ...over }, today)
      return 'error' in r ? r.error : null
    }
    expect(err({ title: '   ' })).toBe('Say what you are holding dates for.')
    expect(err({ dates: [] })).toBe('Pick at least one day to hold.')
    expect(err({ dates: ['2026-10-20'] })).toBe('A date that has passed cannot be held.')
    expect(err({ dates: ['2026-02-31'] })).toBe('One of the dates is not a real day.')
    expect(err({ dates: ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'] })).toBe('Hold up to three dates.')
    expect(err({ holdDays: 5 })).toBe('Hold for 3, 7 or 14 days.')
    expect(err({ playbookId: 'nope' })).toBe('That playbook is not here.')
    expect(err({ startMin: 1500 })).toBe('That is not a start time.')
    expect(err({ timeZone: 'Mars/Olympus' })).toBe('The calendar needs a time zone.')
    expect(planPencilItIn(null, today)).toEqual({ error: 'There was nothing to save.' })
  })
  it('counts a repeated day once', () => {
    const r = planPencilItIn({ ...base, dates: ['2026-10-23', '2026-10-23'] }, today)
    if ('error' in r) throw new Error(r.error)
    expect(r.data.dates).toEqual(['2026-10-23'])
  })
})

describe('planQuickAdd', () => {
  it('reads each kind, and lets only a to-do go without a day', () => {
    expect(planQuickAdd({ kind: 'todo', title: 'Order mats', day: null })).toMatchObject({ data: { kind: 'todo', day: null } })
    expect(planQuickAdd({ kind: 'private', title: 'x', day: null })).toEqual({ error: 'Pick a day.' })
    expect(planQuickAdd({ kind: 'party', title: 'x', day: '2026-10-23' })).toEqual({ error: 'Choose what to add.' })
    expect(planQuickAdd({ kind: 'pencil', title: ' ', day: '2026-10-23' })).toEqual({ error: 'Give it a name.' })
    expect(planQuickAdd({ kind: 'pencil', title: 'x', day: '2026-13-40' })).toEqual({ error: 'That is not a real day.' })
  })
  it('drops the time from an unavailable span', () => {
    const r = planQuickAdd({ kind: 'unavailable', title: 'Pool deck', day: '2026-11-02', startMin: 600 })
    if ('error' in r) throw new Error(r.error)
    expect(r.data.startMin).toBeNull()
    expect(quickEntry(r.data, 'America/Los_Angeles')).toMatchObject({ kind: 'unavailable', allDay: true, blocksTime: true, startDate: '2026-11-02' })
  })
  it('makes a timed private entry that does not block', () => {
    const r = planQuickAdd({ kind: 'private', title: 'Staff sync', day: '2026-10-22', startMin: 600, durMin: 30 })
    if ('error' in r) throw new Error(r.error)
    expect(quickEntry(r.data, 'America/Los_Angeles')).toMatchObject({ kind: 'private', allDay: false, startTime: '10:00', endTime: '10:30', blocksTime: false })
  })
})

describe('pencilDoneLine', () => {
  it('says what is held and until when', () => {
    expect(pencilDoneLine(2, 'Oct 28')).toBe('Pencilled in. Holding 2 dates until Oct 28')
    expect(pencilDoneLine(1, null)).toBe('Pencilled in. Holding 1 date')
  })
})
