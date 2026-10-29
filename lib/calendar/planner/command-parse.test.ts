import { describe, expect, it } from 'vitest'
import { DEFAULT_COHOSTS, parseCommand, parseCommandAt } from './command-parse'

// Wednesday, October 21 2026. The clock is never read: every test passes `today`.
const today = '2026-10-21'
const p = (text: string, over: Partial<{ today: string }> = {}) => parseCommand(text, { today, ...over })

describe('the four example commands', () => {
  it('Pencil supper club with Ocean House next fri 7pm', () => {
    const r = p('Pencil supper club with Ocean House next fri 7pm')!
    expect(r).toMatchObject({ kind: 'pencil', title: 'Supper club', date: '2026-10-30', startMin: 19 * 60, durMin: 60, cohost: { id: 'ocean', name: 'Ocean House' } })
    expect(r.rowLabel).toBe('Add pencil: Supper club')
    expect(r.rowMeta).toBe('Fri, Oct 30, 7 PM')
    expect(r.summary).toBe('Pencil: Supper club, Fri, Oct 30, 7 PM, with Ocean House')
  })
  it('Block pool deck nov 2', () => {
    expect(p('Block pool deck nov 2')).toMatchObject({ kind: 'unavailable', title: 'Pool deck', date: '2026-11-02', startMin: null })
  })
  it('Todo order mats tomorrow', () => {
    expect(p('Todo order mats tomorrow')).toMatchObject({ kind: 'todo', title: 'Order mats', date: '2026-10-22' })
  })
  it('Private staff sync thu 10am for 30 min', () => {
    expect(p('Private staff sync thu 10am for 30 min')).toMatchObject({ kind: 'private', title: 'Staff sync', date: '2026-10-22', startMin: 600, durMin: 30 })
  })
})

describe('kind', () => {
  it('defaults to pencil', () => {
    expect(p('Supper club')?.kind).toBe('pencil')
  })
  it('reads the leading word only', () => {
    expect(p('Sign off the budget')?.kind).toBe('pencil')
    expect(p('Plan the block party')?.kind).toBe('pencil')
    expect(p('Staff private dinner')?.kind).toBe('pencil')
    expect(p('Buy a todo app')?.kind).toBe('pencil')
    expect(p('Offsite retreat')?.kind).toBe('pencil')
  })
  it('reads every leading kind word', () => {
    expect(p('task call vendor')?.kind).toBe('todo')
    expect(p('to-do call vendor')?.kind).toBe('todo')
    expect(p('Remind me to water the garden')).toMatchObject({ kind: 'todo', title: 'Water the garden' })
    expect(p('Unavailable studio floors')?.kind).toBe('unavailable')
    expect(p('Pencil it in supper club')).toMatchObject({ kind: 'pencil', title: 'Supper club' })
  })
  it('keeps the word in the title when it is part of it', () => {
    expect(p('Closed for floors fri')).toMatchObject({ kind: 'unavailable', title: 'Closed for floors' })
    expect(p('Call plumber tomorrow')).toMatchObject({ kind: 'private', title: 'Call plumber' })
    expect(p('Meeting with Ocean House thu 2pm')).toMatchObject({ kind: 'private', title: 'Meeting', cohost: { id: 'ocean' } })
  })
  it('takes an explicit "as <kind>" anywhere', () => {
    expect(p('Sign off the budget as todo')).toMatchObject({ kind: 'todo', title: 'Sign off the budget' })
    expect(p('Pool deck repairs as a block nov 2')).toMatchObject({ kind: 'unavailable', title: 'Pool deck repairs' })
    expect(p('Staff dinner as private fri 6pm')?.kind).toBe('private')
  })
})

describe('day', () => {
  it('defaults to today for anything but a to-do', () => {
    expect(p('Supper club')?.date).toBe(today)
    expect(p('Todo order mats')?.date).toBeNull()
    expect(p('Todo order mats')?.rowMeta).toBe('No date, goes to inbox')
  })
  it('reads today and tomorrow', () => {
    expect(p('Cowork today')).toMatchObject({ date: today, title: 'Cowork' })
    expect(p('Cowork tonight')?.date).toBe(today)
    expect(p('Cowork tomorrow')?.date).toBe('2026-10-22')
  })
  it('never lands a weekday on today', () => {
    expect(p('Cowork wed')?.date).toBe('2026-10-28')
    expect(p('Cowork fri')?.date).toBe('2026-10-23')
    expect(p('Cowork mon')?.date).toBe('2026-10-26')
  })
  it('adds a week for next', () => {
    expect(p('Cowork next fri')?.date).toBe('2026-10-30')
    expect(p('Cowork next monday')?.date).toBe('2026-11-02')
    expect(p('Cowork this fri')?.date).toBe('2026-10-23')
  })
  it('accepts full names and abbreviations', () => {
    expect(p('Cowork thursday')?.date).toBe('2026-10-22')
    expect(p('Cowork thurs')?.date).toBe('2026-10-22')
    expect(p('Cowork Sat')?.date).toBe('2026-10-24')
    expect(p('Cowork on tuesday')).toMatchObject({ date: '2026-10-27', title: 'Cowork' })
  })
  it('reads a month and day, with ordinals, and rolls to next year', () => {
    expect(p('Party nov 2')?.date).toBe('2026-11-02')
    expect(p('Party November 3rd')?.date).toBe('2026-11-03')
    expect(p('Party dec 25')?.date).toBe('2026-12-25')
    expect(p('Party oct 21')?.date).toBe('2026-10-21')
    expect(p('Party oct 20')?.date).toBe('2027-10-20')
    expect(p('Party jan 5', { today: '2026-12-30' })?.date).toBe('2027-01-05')
  })
  it('does not invent a day that is not on the calendar', () => {
    expect(p('Party feb 30')).toMatchObject({ date: today, title: 'Party feb 30' })
  })
  it('reads an ISO day', () => {
    expect(p('Party 2026-12-05')).toMatchObject({ date: '2026-12-05', title: 'Party' })
  })
  it('uses the first kind of day it finds', () => {
    expect(p('Party tomorrow fri')).toMatchObject({ date: '2026-10-22', title: 'Party fri' })
  })
})

describe('whole words only (the prototype bugs)', () => {
  it.each([
    ['Sunset stretch', 'Sunset stretch'],
    ['Wedding planning', 'Wedding planning'],
    ['Monitor stand', 'Monitor stand'],
    ['Saturate the soil', 'Saturate the soil'],
    ['Monthly review', 'Monthly review'],
    ['Thursday’s recap', 'Thursday’s recap'],
    ['Today’s gathering', 'Today’s gathering'],
  ])('keeps "%s" as the title with no day found', (text, title) => {
    expect(p(text)).toMatchObject({ title, date: today })
  })
  it('still finds the real weekday after a lookalike word', () => {
    expect(p('Sunset stretch fri 6pm')).toMatchObject({ title: 'Sunset stretch', date: '2026-10-23', startMin: 18 * 60 })
  })
  it('keeps "on" and "at" inside a title', () => {
    expect(p('Meet at the office fri')).toMatchObject({ title: 'Meet at the office', date: '2026-10-23' })
    expect(p('Notes on the garden')).toMatchObject({ title: 'Notes on the garden' })
    expect(p('Look at the plan on paper tomorrow 3pm')).toMatchObject({ title: 'Look at the plan on paper', startMin: 15 * 60 })
  })
  it('drops "on" and "at" only when they introduce the day or time', () => {
    expect(p('Brunch on fri at 10am')).toMatchObject({ title: 'Brunch', date: '2026-10-23', startMin: 600 })
    expect(p('Brunch on nov 2 at 10:30am')).toMatchObject({ title: 'Brunch', date: '2026-11-02', startMin: 630 })
  })
  it('keeps "next" and "today" inside a title when they are not dates', () => {
    expect(p('Plan the next step')).toMatchObject({ title: 'Plan the next step', date: today })
  })
})

describe('time', () => {
  it.each([
    ['7pm', 19 * 60],
    ['7 pm', 19 * 60],
    ['7:15pm', 19 * 60 + 15],
    ['10am', 600],
    ['10:30', 630],
    ['19:30', 19 * 60 + 30],
    ['12am', 0],
    ['12pm', 12 * 60],
    ['9:05 AM', 9 * 60 + 5],
  ])('reads %s', (t, min) => {
    expect(p(`Event fri ${t}`)?.startMin).toBe(min)
  })
  it('does not read a bare number or a nonsense time', () => {
    expect(p('Table for 7')).toMatchObject({ startMin: null, title: 'Table for 7' })
    expect(p('Event fri 13pm')?.startMin).toBeNull()
    expect(p('Event fri 25:00')?.startMin).toBeNull()
    expect(p('Day 2 recap')).toMatchObject({ startMin: null, title: 'Day 2 recap' })
  })
  it('keeps a time on a to-do and on a block', () => {
    expect(p('Todo call vendor tomorrow 3pm')?.startMin).toBe(15 * 60)
    expect(p('Block pool deck nov 2 2pm for 2 hours')).toMatchObject({ startMin: 14 * 60, durMin: 120 })
  })
})

describe('length', () => {
  it.each([
    ['for 30 min', 30],
    ['for 45 minutes', 45],
    ['for 2 hours', 120],
    ['for 1.5 hrs', 90],
    ['for 1 hour', 60],
    ['for 3h', 180],
    ['for 20m', 20],
  ])('reads %s', (phrase, min) => {
    expect(p(`Event fri 7pm ${phrase}`)?.durMin).toBe(min)
  })
  it('defaults to an hour and strips the phrase from the title', () => {
    expect(p('Event fri')?.durMin).toBe(60)
    expect(p('Staff sync fri for 30 min')?.title).toBe('Staff sync')
  })
  it('leaves "for" alone when no length follows', () => {
    expect(p('Gift for mom')).toMatchObject({ title: 'Gift for mom', durMin: 60 })
  })
})

describe('co-host', () => {
  it.each([
    ['with Ocean House', 'ocean'],
    ['with ocean', 'ocean'],
    ['with Sunshine Vineyard', 'vine'],
    ['with sunshine', 'vine'],
    ['with vine', 'vine'],
    ["with Swami's Beach", 'swami'],
    ["with swami's", 'swami'],
    ['with swami', 'swami'],
  ])('reads %s', (phrase, id) => {
    const r = p(`Supper club ${phrase} fri`)!
    expect(r.cohost?.id).toBe(id)
    expect(r.title).toBe('Supper club')
  })
  it('leaves an unknown "with" in the title', () => {
    expect(p('Lunch with Sam fri')).toMatchObject({ cohost: null, title: 'Lunch with Sam' })
    expect(p('Walk with vineyard dogs')?.cohost).toBeNull()
  })
  it('takes the Space’s own partner list', () => {
    const r = parseCommand('Supper club with Harbor Hall fri', { today, cohosts: [{ id: 'harbor', name: 'Harbor Hall', aliases: ['harbor hall', 'harbor'] }] })
    expect(r?.cohost).toEqual({ id: 'harbor', name: 'Harbor Hall' })
    expect(DEFAULT_COHOSTS).toHaveLength(3)
  })
})

describe('title and edge cases', () => {
  it('capitalises the first letter and tidies spacing', () => {
    expect(p('  pencil   supper    club  ')?.title).toBe('Supper club')
  })
  it('returns null when nothing is left to name', () => {
    expect(p('')).toBeNull()
    expect(p('   ')).toBeNull()
    expect(p('todo tomorrow 7pm')).toBeNull()
    expect(p('pencil')).toBeNull()
  })
  it('strips stray punctuation left by the removals', () => {
    expect(p('Supper club, fri 7pm.')?.title).toBe('Supper club')
    expect(p('Supper club - fri')?.title).toBe('Supper club')
  })
  it('does not change with the case of the input', () => {
    expect(p('PENCIL SUPPER CLUB NEXT FRI 7PM')).toMatchObject({ kind: 'pencil', date: '2026-10-30', startMin: 19 * 60, title: 'SUPPER CLUB' })
  })
})

describe('the preview', () => {
  it('lists what it understood, marking what it filled in', () => {
    const r = p('Supper club with Ocean House fri 7pm')!
    expect(r.understood).toEqual([
      { label: 'Kind', value: 'Pencil', said: false },
      { label: 'Title', value: 'Supper club', said: true },
      { label: 'Day', value: 'Fri, Oct 23', said: true },
      { label: 'Time', value: '7 PM', said: true },
      { label: 'Length', value: '1 hour', said: false },
      { label: 'Co-host', value: 'Ocean House', said: true },
    ])
  })
  it('says a day was assumed, and a to-do has none', () => {
    expect(p('Supper club')!.understood.find((u) => u.label === 'Day')).toEqual({ label: 'Day', value: 'Wed, Oct 21', said: false })
    expect(p('Todo order mats')!.understood.find((u) => u.label === 'Day')).toEqual({ label: 'Day', value: 'No day yet', said: false })
    expect(p('Todo order mats')!.summary).toBe('To-do: Order mats, No date, goes to inbox')
  })
  it('omits the time row when no time was said', () => {
    expect(p('Supper club fri')!.understood.map((u) => u.label)).toEqual(['Kind', 'Title', 'Day', 'Length'])
  })
  it('uses sentence case and no em dash', () => {
    const r = p('Block pool deck nov 2')!
    expect(r.kindWord).toBe('Unavailable')
    expect(`${r.rowLabel}${r.rowMeta}${r.summary}`).not.toMatch(/[–—]/)
  })
})

describe('time zone', () => {
  it('echoes a valid zone and falls back to the home zone for a bad one', () => {
    expect(parseCommand('Cowork fri', { today, timeZone: 'America/Denver' })?.timeZone).toBe('America/Denver')
    expect(parseCommand('Cowork fri', { today, timeZone: 'Mars/Base' })?.timeZone).toBe('America/Los_Angeles')
  })
  it('works out today from an instant in the Space zone', () => {
    // 03:30 UTC on Oct 22 is still the evening of Oct 21 in Los Angeles.
    const now = new Date('2026-10-22T03:30:00Z')
    expect(parseCommandAt('Cowork tomorrow', now, 'America/Los_Angeles')?.date).toBe('2026-10-22')
    expect(parseCommandAt('Cowork tomorrow', now, 'UTC')?.date).toBe('2026-10-23')
  })
})
