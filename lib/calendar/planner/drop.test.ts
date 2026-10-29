import { describe, expect, it, vi } from 'vitest'
import type { EntryInput } from '../entries'
import type { SuiteItem, SuiteTask } from './adapters'
import {
  overlayItems,
  overlayTasks,
  planAfter,
  planBefore,
  planItemDrop,
  planTodoDrop,
  runWrite,
  type DropOutcome,
  type MovePlan,
  type WriteDeps,
} from './drop'

const INPUT: EntryInput = {
  kind: 'private',
  title: 'Staff sync',
  allDay: false,
  startDate: '2026-10-21',
  endDate: '2026-10-21',
  startTime: '10:00',
  endTime: '11:00',
  timeZone: 'America/Los_Angeles',
  blocksTime: false,
  showPublicly: false,
  candidateDates: [],
  repeat: '',
  exceptionDates: [],
}

function item(over: Partial<SuiteItem> = {}): SuiteItem {
  return {
    id: 'entry-1:2026-10-21',
    title: 'Staff sync',
    kind: 'private',
    date: '2026-10-21',
    end: null,
    startMin: 600,
    durMin: 60,
    plan: null,
    whenLabel: '',
    location: null,
    notes: null,
    eventHref: null,
    note: '',
    hostLabel: null,
    entryId: 'entry-1',
    entryInput: INPUT,
    occurrenceDate: null,
    ...over,
  }
}

const weekly = (over: Partial<SuiteItem> = {}): SuiteItem =>
  item({
    id: 'entry-2:2026-10-21',
    title: 'Craft night',
    kind: 'pencil',
    entryId: 'entry-2',
    series: true,
    occurrenceDate: '2026-10-21',
    entryInput: { ...INPUT, kind: 'pencil', title: 'Craft night', repeat: 'FREQ=WEEKLY', exceptionDates: ['2026-10-28'] },
    ...over,
  })

function ready(o: DropOutcome): MovePlan {
  if (o.kind !== 'ready') throw new Error(`expected ready, got ${o.kind}`)
  return o.plan
}

describe('dropping a date on a day', () => {
  it('moves the day and leaves the time alone through the one entry write', () => {
    const plan = ready(planItemDrop(item(), { zone: 'day', day: '2026-10-23' }, []))
    expect(plan.write).toMatchObject({ type: 'entry', entryId: 'entry-1' })
    const input = (plan.write as { input: EntryInput }).input
    expect(input).toMatchObject({ startDate: '2026-10-23', endDate: '2026-10-23', startTime: '10:00', endTime: '11:00' })
    expect(plan.items[0].after).toEqual({ date: '2026-10-23', end: null, startMin: 600, durMin: 60 })
    expect(plan.line).toBe('Moved Staff sync to Fri, Oct 23, 10 AM.')
  })
  it('keeps the length of a run of days', () => {
    const band = item({ end: '2026-10-23', startMin: null, entryInput: { ...INPUT, allDay: true, endDate: '2026-10-23' } })
    const plan = ready(planItemDrop(band, { zone: 'day', day: '2026-10-26' }, []))
    expect((plan.write as { input: EntryInput }).input).toMatchObject({ startDate: '2026-10-26', endDate: '2026-10-28' })
  })
  it('is nothing to do when it lands where it was', () => {
    expect(planItemDrop(item(), { zone: 'day', day: '2026-10-21' }, [])).toEqual({ kind: 'noop' })
  })
})

describe('dropping a date on a time', () => {
  it('snaps to 15 minutes and writes a timed day of the same length', () => {
    const plan = ready(planItemDrop(item({ durMin: 90 }), { zone: 'time', day: '2026-10-22', startMin: 14 * 60 + 8 }, []))
    const input = (plan.write as { input: EntryInput }).input
    expect(input).toMatchObject({ allDay: false, startDate: '2026-10-22', endDate: '2026-10-22', startTime: '14:15', endTime: '15:45' })
    expect(plan.items[0].after).toEqual({ date: '2026-10-22', end: null, startMin: 855, durMin: 90 })
    expect(plan.line).toBe('Moved Staff sync to Thu, Oct 22, 2:15 PM.')
  })
  it('turns an all-day date into a one-hour timed one', () => {
    const allDay = item({ startMin: null, durMin: 0, entryInput: { ...INPUT, allDay: true } })
    const plan = ready(planItemDrop(allDay, { zone: 'time', day: '2026-10-21', startMin: 540 }, []))
    expect((plan.write as { input: EntryInput }).input).toMatchObject({ allDay: false, startTime: '09:00', endTime: '10:00' })
  })
  it('never runs past midnight', () => {
    const plan = ready(planItemDrop(item({ durMin: 180 }), { zone: 'time', day: '2026-10-21', startMin: 23 * 60 }, []))
    expect((plan.write as { input: EntryInput }).input.endTime).toBe('23:59')
  })
})

describe('what cannot be dragged', () => {
  it('a published event keeps the sentence the date-move seam gives it', () => {
    const ev = item({ kind: 'event', entryId: null, entryInput: null })
    expect(planItemDrop(ev, { zone: 'day', day: '2026-10-22' }, [])).toEqual({
      kind: 'refused',
      line: 'Staff sync is a published event now. Open the event to change its date.',
    })
  })
  it('a date another Space hosts and a cancelled date stay put', () => {
    expect(planItemDrop(item({ hostLabel: 'Another Space', shared: true }), { zone: 'day', day: '2026-10-22' }, []).kind).toBe('refused')
    expect(planItemDrop(item({ kind: 'cancelled' }), { zone: 'day', day: '2026-10-22' }, []).kind).toBe('refused')
  })
})

describe('a repeating date asks on every path', () => {
  it.each([
    ['a day', { zone: 'day', day: '2026-10-23' } as const],
    ['a time', { zone: 'time', day: '2026-10-21', startMin: 18 * 60 } as const],
    ['the all-day row', { zone: 'day', day: '2026-10-22' } as const],
  ])('on %s it asks first and writes nothing', (_name, target) => {
    const out = planItemDrop(weekly(), target, [])
    expect(out.kind).toBe('ask')
    if (out.kind !== 'ask') return
    expect(out.series.ask).toBe(true)
    expect(out.series.thisDate).toBe('2026-10-21')
    expect(out.choose('keep')).toBeNull()
  })
  it('this date only splits the one occurrence and offers no Undo', () => {
    const out = planItemDrop(weekly(), { zone: 'day', day: '2026-10-23' }, [])
    if (out.kind !== 'ask') throw new Error('expected ask')
    const plan = out.choose('thisDate') as MovePlan
    expect(plan.write).toMatchObject({ type: 'occurrence', entryId: 'entry-2', day: '2026-10-21' })
    expect((plan.write as { input: EntryInput }).input).toMatchObject({ startDate: '2026-10-23', endDate: '2026-10-23' })
    expect(plan.items.map((c) => c.id)).toEqual(['entry-2:2026-10-21'])
    expect(plan.undo).toBeNull()
  })
  it('the whole series shifts every date and its skips, and Undo restores the master', () => {
    const a = weekly()
    const b = weekly({ id: 'entry-2:2026-11-04', date: '2026-11-04', occurrenceDate: '2026-11-04' })
    const out = planItemDrop(a, { zone: 'time', day: '2026-10-22', startMin: 19 * 60 }, [a, b])
    if (out.kind !== 'ask') throw new Error('expected ask')
    const plan = out.choose('series') as MovePlan
    const input = (plan.write as { input: EntryInput }).input
    expect(input).toMatchObject({ startDate: '2026-10-22', endDate: '2026-10-22', startTime: '19:00', endTime: '20:00', exceptionDates: ['2026-10-29'] })
    expect(plan.items.map((c) => [c.id, c.after.date, c.after.startMin])).toEqual([
      ['entry-2:2026-10-21', '2026-10-22', 1140],
      ['entry-2:2026-11-04', '2026-11-05', 1140],
    ])
    expect(plan.undo).toEqual({ type: 'entry', entryId: 'entry-2', input: a.entryInput })
    expect(plan.line).toBe('Moved Craft night and every repeat 1 day later.')
  })
})

describe('dropping an inbox to-do', () => {
  const todo: SuiteTask = { id: 't1', title: 'Order mats', due: null, done: false, estHours: 1, sharedFrom: null }
  it('updates the same to-do and its Undo puts it back in the inbox', () => {
    const plan = ready(planTodoDrop(todo, { zone: 'day', day: '2026-10-22' }))
    expect(plan.write).toEqual({ type: 'todo', id: 't1', due: '2026-10-22' })
    expect(plan.undo).toEqual({ type: 'todo', id: 't1', due: null })
    expect(plan.line).toBe('Order mats is due Thu, Oct 22.')
  })
  it('on a time saves the day and the start minute together', () => {
    const plan = ready(planTodoDrop(todo, { zone: 'time', day: '2026-10-22', startMin: 13 * 60 + 5 }))
    expect(plan.todo?.after).toEqual({ due: '2026-10-22', startMin: 780 })
    expect(plan.write).toEqual({ type: 'todo', id: 't1', due: '2026-10-22', startMin: 780 })
    expect(plan.undo).toEqual({ type: 'todo', id: 't1', due: null, startMin: null })
    expect(plan.line).toBe('Order mats is due Thu, Oct 22 at 1 PM.')
  })
  it('leaves a to-do from another Space alone', () => {
    expect(planTodoDrop({ ...todo, sharedFrom: 'Swami' }, { zone: 'day', day: '2026-10-22' }).kind).toBe('refused')
  })
})

describe('Undo is one write that restores the snapshot', () => {
  const deps = (): WriteDeps & { calls: unknown[] } => {
    const calls: unknown[] = []
    return {
      calls,
      saveEntry: vi.fn(async (...a: unknown[]) => (calls.push(['entry', ...a]), { data: undefined })),
      saveOccurrence: vi.fn(async (...a: unknown[]) => (calls.push(['occurrence', ...a]), { data: undefined })),
      moveTodo: vi.fn(async (...a: unknown[]) => (calls.push(['todo', ...a]), { data: undefined })),
    }
  }
  it('a date: the move writes the new input, Undo writes the original input once', async () => {
    const d = deps()
    const it1 = item()
    const plan = ready(planItemDrop(it1, { zone: 'day', day: '2026-10-24' }, [it1]))
    expect(await runWrite(plan.write, d)).toBeNull()
    expect(await runWrite(plan.undo!, d)).toBeNull()
    expect(d.calls).toHaveLength(2)
    expect(d.calls[1]).toEqual(['entry', 'entry-1', INPUT])
    // The grid agrees: the places the plan restores are exactly the places the item started with.
    const moved = overlayItems([it1], planAfter(plan).items)
    expect(moved[0].date).toBe('2026-10-24')
    const back = overlayItems(moved, planBefore(plan).items)
    expect(back[0]).toMatchObject({ date: '2026-10-21', end: null, startMin: 600, durMin: 60 })
  })
  it('a to-do: Undo writes the old due day once', async () => {
    const d = deps()
    const t: SuiteTask = { id: 't1', title: 'Order mats', due: '2026-10-20', done: false, sharedFrom: null }
    const plan = ready(planTodoDrop(t, { zone: 'day', day: '2026-10-25' }))
    await runWrite(plan.write, d)
    await runWrite(plan.undo!, d)
    expect(d.calls).toEqual([
      ['todo', 't1', '2026-10-25', undefined],
      ['todo', 't1', '2026-10-20', undefined],
    ])
    const back = overlayTasks(overlayTasks([t], planAfter(plan).todo), planBefore(plan).todo)
    expect(back[0]).toMatchObject({ due: '2026-10-20', startMin: null })
  })
  it('a write the server refuses comes back as its sentence', async () => {
    const d: WriteDeps = {
      saveEntry: async () => ({ error: 'That date no longer exists.' }),
      saveOccurrence: async () => ({ data: undefined }),
      moveTodo: async () => {
        throw new Error('network')
      },
    }
    expect(await runWrite({ type: 'entry', entryId: 'x', input: INPUT }, d)).toBe('That date no longer exists.')
    expect(await runWrite({ type: 'todo', id: 'x', due: null }, d)).toBe('Something went wrong. Try again.')
  })
})
