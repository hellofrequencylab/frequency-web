import { describe, expect, it } from 'vitest'
import type { EntryInput } from '../entries'
import type { SuiteItem } from './adapters'
import { agoLabel, holdSentence, lengthChoices, nextWeekCopy, offsetPhrase, planDoorStage, planItemEdit, startChoices, todoDueLine } from './details'

const INPUT: EntryInput = {
  kind: 'pencil',
  title: 'Supper club',
  notes: 'Bring plates',
  allDay: false,
  startDate: '2026-10-21',
  endDate: '2026-10-21',
  startTime: '18:00',
  endTime: '20:00',
  timeZone: 'America/Los_Angeles',
  stage: 'pencil',
  blocksTime: false,
  showPublicly: false,
  candidateDates: ['2026-10-30'],
  repeat: '',
  exceptionDates: [],
}

function item(over: Partial<SuiteItem> = {}, input: Partial<EntryInput> = {}): SuiteItem {
  return {
    id: 'entry-a:2026-10-21',
    title: 'Supper club',
    kind: 'pencil',
    date: '2026-10-21',
    end: null,
    startMin: 18 * 60,
    durMin: 120,
    plan: null,
    whenLabel: '',
    location: null,
    notes: 'Bring plates',
    eventHref: null,
    note: '',
    hostLabel: null,
    entryId: 'entry-a',
    entryInput: { ...INPUT, ...input },
    occurrenceDate: null,
    ...over,
  }
}

function written(out: ReturnType<typeof planItemEdit>) {
  if (out.kind !== 'write') throw new Error(`expected a write, got ${out.kind}`)
  if (out.write.call.type !== 'entry') throw new Error('expected an entry write')
  return { call: out.write.call, date: out.write.date }
}

describe('planItemEdit', () => {
  it('renames through the entry write and clears the candidate dates', () => {
    const { call } = written(planItemEdit(item(), { title: '  Supper club, late  ' }))
    expect(call.entryId).toBe('entry-a')
    expect(call.input.title).toBe('Supper club, late')
    expect(call.input.candidateDates).toEqual([])
  })

  it('refuses a blank title with the form sentence', () => {
    expect(planItemEdit(item(), { title: '   ' })).toEqual({ kind: 'refused', line: 'Give the date a title.' })
  })

  it('says nothing when nothing changed', () => {
    expect(planItemEdit(item(), { title: 'Supper club', date: '2026-10-21', startMin: 1080, durMin: 120, notes: 'Bring plates' })).toEqual({ kind: 'noop' })
  })

  it('moves the date and keeps the span of a multi-day date', () => {
    const multi = item({ end: '2026-10-22', startMin: null, durMin: 0 }, { allDay: true, endDate: '2026-10-22' })
    const { call, date } = written(planItemEdit(multi, { date: '2026-10-25' }))
    expect(call.input.startDate).toBe('2026-10-25')
    expect(call.input.endDate).toBe('2026-10-26')
    expect(date).toBe('2026-10-25')
  })

  it('makes an all-day date timed, an hour long, and a timed date all-day', () => {
    const allDay = item({ startMin: null, durMin: 60 }, { allDay: true })
    const timed = written(planItemEdit(allDay, { startMin: 9 * 60 })).call.input
    expect(timed).toMatchObject({ allDay: false, startTime: '09:00', endTime: '10:00' })
    const back = written(planItemEdit(item(), { startMin: null })).call.input
    expect(back.allDay).toBe(true)
  })

  it('changes the length from the start', () => {
    const { call } = written(planItemEdit(item(), { durMin: 180 }))
    expect(call.input).toMatchObject({ startTime: '18:00', endTime: '21:00' })
  })

  it('moves a pencil to a stage, and calls a private entry off by its status', () => {
    expect(written(planItemEdit(item(), { stage: 'production' })).call.input.stage).toBe('production')
    const priv = item({ kind: 'private' }, { kind: 'private', stage: null })
    expect(written(planItemEdit(priv, { stage: 'cancelled' })).call.input.status).toBe('cancelled')
    expect(planItemEdit(priv, { stage: 'production' }).kind).toBe('refused')
  })

  it('refuses a published event and a date another Space hosts', () => {
    const event = item({ kind: 'event', entryId: null, entryInput: null, eventHref: '/events/x' })
    expect(planItemEdit(event, { title: 'x' })).toMatchObject({ kind: 'refused' })
    expect(planItemEdit(item({ hostLabel: 'Another Space' }), { title: 'x' })).toMatchObject({ kind: 'refused' })
  })
})

describe('planItemEdit on a repeating date', () => {
  const craft = item(
    { id: 'entry-craft:2026-10-19', entryId: 'entry-craft', date: '2026-10-19', occurrenceDate: '2026-10-19', series: true, title: 'Craft night' },
    { title: 'Craft night', startDate: '2026-10-05', endDate: '2026-10-05', repeat: 'FREQ=WEEKLY', exceptionDates: ['2026-10-12'] },
  )

  it('asks before it writes, and writes nothing on Go back', () => {
    const out = planItemEdit(craft, { title: 'Craft and tea' })
    if (out.kind !== 'ask') throw new Error('expected a question')
    expect(out.series.thisDate).toBe('2026-10-19')
    expect(out.choose('keep')).toBeNull()
  })

  it('This date only splits the series at that day, standing on that day', () => {
    const out = planItemEdit(craft, { title: 'Craft and tea' })
    if (out.kind !== 'ask') throw new Error('expected a question')
    const w = out.choose('thisDate')
    expect(w?.call).toMatchObject({ type: 'occurrence', entryId: 'entry-craft', day: '2026-10-19' })
    if (w?.call.type !== 'occurrence') throw new Error('expected an occurrence write')
    expect(w.call.input).toMatchObject({ title: 'Craft and tea', startDate: '2026-10-19', endDate: '2026-10-19' })
  })

  it('the whole series shifts every date, the skips included', () => {
    const out = planItemEdit(craft, { date: '2026-10-21' })
    if (out.kind !== 'ask') throw new Error('expected a question')
    const w = out.choose('series')
    if (w?.call.type !== 'entry') throw new Error('expected an entry write')
    expect(w.call.input).toMatchObject({ startDate: '2026-10-07', endDate: '2026-10-07', exceptionDates: ['2026-10-14'] })
  })
})

describe('nextWeekCopy', () => {
  it('copies one date a week on as a one-off with no candidates', () => {
    const copy = nextWeekCopy(item({ end: '2026-10-22' }, { endDate: '2026-10-22', repeat: 'FREQ=WEEKLY', exceptionDates: ['2026-10-28'] }))
    expect(copy?.date).toBe('2026-10-28')
    expect(copy?.input).toMatchObject({ startDate: '2026-10-28', endDate: '2026-10-29', repeat: '', exceptionDates: [], candidateDates: [] })
    expect(copy?.line).toBe('Copied Supper club to Wed, Oct 28.')
  })

  it('has nothing to copy for a published event', () => {
    expect(nextWeekCopy(item({ entryId: null, entryInput: null }))).toBeNull()
  })
})

describe('the lists and the words', () => {
  it('the Starts list is All day then 6 AM to 11:30 PM, and keeps an off-grid start', () => {
    const list = startChoices(null)
    expect(list[0]).toEqual({ value: 'all', label: 'All day' })
    expect(list[1].label).toBe('6 AM')
    expect(list.at(-1)?.label).toBe('11:30 PM')
    expect(list).toHaveLength(37)
    expect(startChoices(9 * 60 + 15).some((c) => c.label === '9:15 AM')).toBe(true)
  })

  it('the Length list is the eight spoken lengths, and keeps a 45 minute block', () => {
    expect(lengthChoices(60).map((c) => c.label)).toEqual(['30 min', '1 hour', '1.5 hours', '2 hours', '3 hours', '4 hours', '6 hours', '7.5 hours'])
    expect(lengthChoices(45).map((c) => c.label)[1]).toBe('45 min')
  })

  it('speaks an offset and a to-do due line', () => {
    expect(offsetPhrase(-14)).toBe('14 days before')
    expect(offsetPhrase(0)).toBe('on the day')
    expect(offsetPhrase(1)).toBe('1 day after')
    expect(offsetPhrase(null)).toBe('')
    expect(todoDueLine('2026-10-26', -3)).toBe('Mon, Oct 26 · 3 days before')
    expect(todoDueLine(null, -3)).toBe('No date · 3 days before')
    expect(todoDueLine(null, null)).toBe('No date yet')
  })

  it('prints the hold with the weekday, and says when it lapsed', () => {
    expect(holdSentence('2026-10-27', '2026-10-21')).toBe('Holding until Tue, Oct 27 · 6 days left')
    expect(holdSentence('2026-10-20', '2026-10-21')).toBe('Hold lapsed Tue, Oct 20')
    expect(holdSentence(null, '2026-10-21')).toBe('')
  })

  it('maps the panel stages onto the Plan door', () => {
    expect(planDoorStage('planning')).toBe('plan')
    expect(planDoorStage('cancelled')).toBe('cancelled')
  })

  it('says how long ago', () => {
    const now = Date.parse('2026-10-21T12:00:00Z')
    const ago = (mins: number) => agoLabel(new Date(now - mins * 60_000).toISOString(), now)
    expect(ago(0)).toBe('just now')
    expect(ago(12)).toBe('12 min ago')
    expect(ago(120)).toBe('2 h ago')
    expect(ago(60 * 30)).toBe('yesterday')
    expect(ago(60 * 24 * 3)).toBe('3 days ago')
    expect(ago(60 * 24 * 20)).toBe('Oct 1')
  })
})
