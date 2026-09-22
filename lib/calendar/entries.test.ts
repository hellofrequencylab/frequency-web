import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  blockingRange,
  entryDaySpan,
  entryToCalendarItem,
  entryToInput,
  parseEntryInput,
  publicUnavailableToItem,
  spanDayKeys,
  type EntryFormatters,
  type EntryInput,
  type EntryRow,
} from './entries'
import { CALENDAR_LAYERS, ENTRY_KINDS } from './registry'
import { monthGridWindow, safeMonth } from './month-window'
import { eventInstant } from '@/lib/time/zone'

// The private calendar layer, pure half (ADR-1385). These pin the three things that would fail
// silently: the all-day exclusive end, the public projection carrying no details, and a blocking
// entry turning into the right TRUE instant range for bookings.

const base: EntryInput = {
  kind: 'unavailable',
  title: 'Closed for the holiday',
  notes: 'Staff only',
  location: '',
  allDay: true,
  startDate: '2026-12-24',
  endDate: '2026-12-26',
  startTime: '09:00',
  endTime: '17:00',
  timeZone: 'America/Los_Angeles',
  status: 'confirmed',
  blocksTime: true,
  showPublicly: true,
}

const fmt: EntryFormatters = {
  timeLabel: () => 'T',
  whenLabel: () => 'W',
  dateLabel: (iso) => iso.slice(0, 10),
  instantIso: (iso) => iso,
}

function row(input: EntryInput, id = '11111111-1111-4111-8111-111111111111'): EntryRow {
  const parsed = parseEntryInput(input)
  if ('error' in parsed) throw new Error(parsed.error)
  return { id, space_id: 's', option_group: null, published_event_id: null, ...parsed.data }
}

describe('parseEntryInput', () => {
  it('stores an all-day span with an exclusive end the day after the last day', () => {
    const r = row(base)
    expect(r.starts_at).toBe('2026-12-24T00:00:00.000Z')
    expect(r.ends_at).toBe('2026-12-27T00:00:00.000Z')
    expect(r.visibility).toBe('public_unavailable')
    expect(r.location).toBeNull()
  })

  it('keeps a timed entry as wall clock parts', () => {
    const r = row({ ...base, kind: 'private', allDay: false, endDate: '2026-12-24', startTime: '18:30', endTime: '20:00' })
    expect(r.starts_at).toBe('2026-12-24T18:30:00.000Z')
    expect(r.ends_at).toBe('2026-12-24T20:00:00.000Z')
  })

  it('never lets a Private entry be shown publicly', () => {
    expect(row({ ...base, kind: 'private' }).visibility).toBe('team')
  })

  it('refuses bad input with a plain sentence', () => {
    expect(parseEntryInput({ ...base, kind: 'party' })).toEqual({ error: 'Choose what kind of date this is.' })
    expect(parseEntryInput({ ...base, title: '  ' })).toEqual({ error: 'Give the date a title.' })
    expect(parseEntryInput({ ...base, startDate: '2026-02-31' })).toEqual({ error: 'Pick a valid date.' })
    expect(parseEntryInput({ ...base, endDate: '2026-12-01' })).toEqual({ error: 'The end date is before the start date.' })
    expect(parseEntryInput({ ...base, allDay: false, endDate: '2026-12-24', startTime: '10:00', endTime: '09:00' })).toEqual({
      error: 'The end time is before the start time.',
    })
  })
})

describe('the round trip and the grid span', () => {
  it('reads a stored all-day entry back to the same form', () => {
    const back = entryToInput(row(base))
    expect(back.startDate).toBe('2026-12-24')
    expect(back.endDate).toBe('2026-12-26')
    expect(back.allDay).toBe(true)
  })

  it('keeps a Plan id on the write', () => {
    const r = row({ ...base, planId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
    expect(r.plan_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  })

  it('spans the inclusive days an entry covers', () => {
    expect(entryDaySpan(row(base))).toEqual({ dayKey: '2026-12-24', endDayKey: '2026-12-26' })
    expect(spanDayKeys('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
    expect(spanDayKeys('2026-01-01', '2027-01-01')).toHaveLength(62)
  })
})

describe('what each audience sees', () => {
  it('gives staff the full entry, editable, on its own layer', () => {
    const item = entryToCalendarItem(row(base), fmt, { editable: true })
    expect(item.layer).toBe('unavailable')
    expect(item.notes).toBe('Staff only')
    expect(item.entryInput?.title).toBe('Closed for the holiday')
    expect(item.endDayKey).toBe('2026-12-26')
  })

  it('draws a repeating Pencil once per landing in the window, minus its skips, each opening the master (PROG-CAL5)', async () => {
    const { entryItemsInWindow } = await import('./entries')
    const pencil = row({
      ...base,
      kind: 'pencil',
      allDay: false,
      startDate: '2026-10-05',
      endDate: '2026-10-05',
      startTime: '19:00',
      endTime: '21:00',
      repeat: 'FREQ=WEEKLY;INTERVAL=2',
      exceptionDates: ['2026-11-02'],
    })
    expect(pencil.recurrence_rule).toBe('FREQ=WEEKLY;INTERVAL=2')
    expect(pencil.exception_dates).toEqual(['2026-11-02'])
    const items = entryItemsInWindow(pencil, fmt, { editable: true }, { fromDay: '2026-10-25', toDay: '2026-12-06' })
    expect(items.map((i) => i.dayKey)).toEqual(['2026-11-16', '2026-11-30'])
    expect(items.map((i) => i.slug)).toEqual([`entry-${pencil.id}-2026-11-16`, `entry-${pencil.id}-2026-11-30`])
    for (const i of items) {
      expect(i.entryId).toBe(pencil.id)
      expect(i.occurrenceDate).toBe(i.dayKey)
      // The drawer edits the SERIES: the form is the master's, anchored on the first date.
      expect(i.entryInput?.startDate).toBe('2026-10-05')
      expect(i.entryInput?.repeat).toBe('FREQ=WEEKLY;INTERVAL=2')
      expect(i.entryInput?.exceptionDates).toEqual(['2026-11-02'])
      expect(i.statusLabel).toContain('Every 2 weeks')
    }
    // A one-off is one item, and a non-Pencil never repeats however the form was filled.
    expect(entryItemsInWindow(row(base), fmt, { editable: true }, { fromDay: '2026-12-01', toDay: '2027-01-01' })).toHaveLength(1)
    expect(row({ ...base, repeat: 'FREQ=WEEKLY' }).recurrence_rule).toBeNull()
    // Nothing in the round trip infers a skip or drops one.
    const back = entryToInput(pencil)
    expect(back.exceptionDates).toEqual(['2026-11-02'])
    expect(row(back).exception_dates).toEqual(['2026-11-02'])
  })

  it('gives the public a bare Unavailable span with no details', () => {
    const r = row(base)
    const item = publicUnavailableToItem(
      { starts_at: r.starts_at, ends_at: r.ends_at, all_day: r.all_day, time_zone: r.time_zone },
      fmt,
      0,
    )
    expect(item.title).toBe('Unavailable')
    expect(item.notes).toBeUndefined()
    expect(item.entryId).toBeUndefined()
    expect(item.location).toBeNull()
  })
})

describe('blockingRange', () => {
  it('converts the wall clock in the entry zone to the true instant range', () => {
    const r = row(base)
    const range = blockingRange(r, eventInstant)!
    // 00:00 in Los Angeles in December is 08:00 UTC.
    expect(new Date(range.startMs).toISOString()).toBe('2026-12-24T08:00:00.000Z')
    expect(new Date(range.endMs).toISOString()).toBe('2026-12-27T08:00:00.000Z')
  })

  it('does not block when the entry does not block time or is cancelled', () => {
    expect(blockingRange({ ...row(base), blocks_time: false }, eventInstant)).toBeNull()
    expect(blockingRange({ ...row(base), status: 'cancelled' }, eventInstant)).toBeNull()
  })
})

describe('the registry and the month window', () => {
  it('matches the kinds the migration allows', () => {
    const sql = readFileSync('supabase/migrations/20270345005200_private_calendar_layer.sql', 'utf8')
    const allowed = /kind\s+text not null check \(kind in \(([^)]*)\)\)/.exec(sql)![1]
    expect(allowed.split(',').map((s) => s.trim().replace(/'/g, '')).sort()).toEqual(ENTRY_KINDS.map((k) => k.kind).sort())
    for (const k of ENTRY_KINDS) expect(CALENDAR_LAYERS.some((l) => l.key === k.layer)).toBe(true)
  })

  it('loads the whole visible grid of a month', () => {
    // September 2026 starts on a Tuesday and ends on a Wednesday.
    expect(monthGridWindow(2026, 9)).toEqual({ fromDay: '2026-08-30', toDay: '2026-10-04' })
    expect(safeMonth(2026, 13)).toBeNull()
    expect(safeMonth('2026', '2')).toEqual({ year: 2026, month1: 2 })
  })
})

describe('pencils (ADR-1386)', () => {
  it('is tentative by default and shifts candidate dates by whole days', async () => {
    const { candidateWrites } = await import('./entries')
    const r = row({ ...base, kind: 'pencil', allDay: false, status: null, endDate: '2026-10-12', startDate: '2026-10-12', startTime: '19:00', endTime: '21:00', holdExpiresOn: '2026-10-01' })
    expect(r.status).toBe('tentative')
    expect(r.hold_expires_at).toBe('2026-10-01T00:00:00.000Z')
    const extra = candidateWrites(r, ['2026-10-19', '2026-10-12', '', '2026-10-19'])
    if ('error' in extra) throw new Error(extra.error)
    expect(extra.map((e) => [e.starts_at, e.ends_at])).toEqual([['2026-10-19T19:00:00.000Z', '2026-10-19T21:00:00.000Z']])
    expect(candidateWrites(r, ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])).toEqual({
      error: 'A Pencil can carry 6 dates at most.',
    })
  })
})

describe('day notes (ADR-1386)', () => {
  it('places weekly and dated notes on the right days, within bounds', async () => {
    const { notesForDay, parseDayNoteInput } = await import('./day-notes')
    const notes = [
      { id: '1', label: 'Quiet hours', weekdays: [1], startsOn: '2026-09-22', endsOn: '2027-09-26' },
      { id: '2', label: 'Retreat & rental', weekdays: [5, 6], startsOn: null, endsOn: null },
      { id: '3', label: 'Thanksgiving', weekdays: null, startsOn: '2026-11-24', endsOn: '2026-11-25' },
    ]
    expect(notesForDay(notes, '2026-09-28')).toEqual(['Quiet hours']) // a Monday in range
    expect(notesForDay(notes, '2026-09-21')).toEqual([]) // a Monday before it starts
    expect(notesForDay(notes, '2026-09-25')).toEqual(['Retreat & rental']) // Friday
    expect(notesForDay(notes, '2026-11-25')).toEqual(['Thanksgiving'])
    expect(parseDayNoteInput({ label: 'X', mode: 'weekly', weekdays: [], startsOn: '', endsOn: '' })).toEqual({
      error: 'Pick at least one day of the week.',
    })
  })
})

describe('stages and description (ADR-1388)', () => {
  const pencil = { ...base, kind: 'pencil', allDay: false, startDate: '2026-10-12', endDate: '2026-10-12', startTime: '19:00', endTime: '21:00' }

  it('derives status from the stage, the same pairing the table trigger enforces', async () => {
    const { ENTRY_STAGES } = await import('./registry')
    for (const st of ENTRY_STAGES) {
      const r = row({ ...pencil, stage: st.stage, status: 'confirmed' })
      expect([r.stage, r.status]).toEqual([st.stage, st.status])
    }
    expect(row({ ...pencil, stage: 'nonsense' }).stage).toBe('pencil')
    expect(row({ ...pencil, stage: null }).stage).toBe('pencil')
  })

  it('declares the same stages and derived statuses as the migration', async () => {
    const { ENTRY_STAGES } = await import('./registry')
    const sql = readFileSync('supabase/migrations/20270345005500_calendar_stages_and_description.sql', 'utf8')
    const allowed = /check \(stage is null or stage in \(([^)]*)\)\)/.exec(sql)![1]
    expect(allowed.split(',').map((x) => x.trim().replace(/'/g, '')).sort()).toEqual(ENTRY_STAGES.map((d) => d.stage).sort())
    for (const d of ENTRY_STAGES.filter((x) => x.stage !== 'planning' && x.stage !== 'production')) {
      expect(sql).toContain(`when '${d.stage}' then '${d.status}'`)
    }
    for (const d of ENTRY_STAGES.filter((x) => x.stage === 'planning' || x.stage === 'production')) expect(d.status).toBe('confirmed')
    expect(sql).toMatch(/else 'confirmed'/)
  })

  it('keeps a lapse date only while the event is still a Pencil', () => {
    expect(row({ ...pencil, stage: 'pencil', holdExpiresOn: '2026-10-01' }).hold_expires_at).toBe('2026-10-01T00:00:00.000Z')
    expect(row({ ...pencil, stage: 'planning', holdExpiresOn: '2026-10-01' }).hold_expires_at).toBeNull()
  })

  it('carries a description on an event on its way and on nothing else', () => {
    expect(row({ ...pencil, description: '  A night of sound.  ' }).description).toBe('A night of sound.')
    const other = row({ ...base, kind: 'private', stage: 'planning', description: 'ignored' })
    expect([other.stage, other.description]).toEqual([null, null])
  })

  it('labels and styles the calendar item by its stage, and round-trips the form', async () => {
    const { itemChipClass, entryStage } = await import('./registry')
    const r = row({ ...pencil, stage: 'production', description: 'Come dance.', holdExpiresOn: '2026-10-01' })
    const item = entryToCalendarItem(r, fmt, { editable: true, now: '2026-12-01' })
    expect(item.sourceLabel).toBe('Production')
    expect(item.stage).toBe('production')
    expect(item.statusLabel ?? '').not.toContain('Lapsed')
    expect(item.description).toBe('Come dance.')
    expect(item.entryInput?.stage).toBe('production')
    expect(item.entryInput?.description).toBe('Come dance.')
    expect(itemChipClass('pencil', 'production')).toBe(entryStage('production')!.chipClass)
    expect(itemChipClass('private', null)).not.toBe(entryStage('pencil')!.chipClass)
  })
})

describe('stage presentation is the registry (calendar stage colours)', () => {
  it('never drops a stored stage, whatever the kind, and a cancelled stage cancels the item', async () => {
    const r = { ...row({ ...base, kind: 'private' }), stage: 'cancelled' as const, status: 'confirmed' as const }
    const item = entryToCalendarItem(r, fmt, { editable: false })
    expect(item.stage).toBe('cancelled')
    expect(item.isCancelled).toBe(true)
    expect(item.sourceLabel).toBe('Cancelled')
  })

  it('paints cancelled grey and struck through ahead of any stage or layer, and never with the brand', async () => {
    const { ENTRY_STAGES, entryStage, itemChipClass, itemTitleClass, itemSelectedClass, itemBadgeTone, CANCELLED_TEXT_CLASS } =
      await import('./registry')
    for (const st of ENTRY_STAGES) {
      expect(st.chipClass).not.toMatch(/primary|warning|signal|\//)
    }
    expect(itemChipClass('events', null, true)).toBe(entryStage('cancelled')!.chipClass)
    expect(itemChipClass('pencil', 'planning', true)).toBe(entryStage('cancelled')!.chipClass)
    expect(itemTitleClass('cancelled')).toBe(CANCELLED_TEXT_CLASS)
    expect(itemTitleClass(null, true)).toBe(CANCELLED_TEXT_CLASS)
    expect(itemTitleClass('planning')).toBe('')
    expect(itemSelectedClass('cancelled')).not.toContain('bg-primary')
    expect(itemSelectedClass('cancelled')).toContain('line-through')
    expect(itemSelectedClass('production')).toContain('bg-primary-bg')
    expect(itemBadgeTone('cancelled')).toBe('danger')
    expect(itemBadgeTone('planning')).toBe('info')
    expect(itemBadgeTone('production')).toBe('success')
    expect(itemBadgeTone(null, false)).toBe('neutral')
  })

  it('separates the four stages by form, not hue alone', async () => {
    const { ENTRY_STAGES, entryStage: stage } = await import('./registry')
    expect(stage('pencil')!.chipClass).toContain('border-dashed')
    expect(stage('planning')!.chipClass).not.toContain('border')
    expect(stage('production')!.chipClass).toContain('border-success')
    expect(stage('cancelled')!.chipClass).toContain('line-through')
    expect(new Set(ENTRY_STAGES.map((d) => d.chipClass)).size).toBe(4)
  })
})
