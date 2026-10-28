import { describe, expect, it } from 'vitest'
import { needsYou } from './needs-you'
import type { PlannerData, PlannerItem, PlannerPlan, PlannerTask } from './types'

const today = '2026-10-21'
const own = 'meld'
const names = { ocean: 'Ocean House', swami: "Swami's Beach" }
const plan = (o: Partial<PlannerPlan> & { id: string }): PlannerPlan => ({
  title: o.id, stage: 'planning', target: 'Event', team: [], spaces: [{ id: 'meld', role: 'Host', status: 'accepted' }], ...o,
})
const item = (o: Partial<PlannerItem> & { id: string }): PlannerItem => ({
  title: o.id, kind: 'pencil', date: '2026-10-27', startMin: 1080, durMin: 60, ...o,
})
const task = (o: Partial<PlannerTask> & { id: string }): PlannerTask => ({ title: o.id, due: null, done: false, ...o })

const data: PlannerData = {
  plans: [
    plan({ id: 'beach', title: 'Beach clean', stage: 'pencil', hold: '2026-10-27', spaces: [{ id: 'swami', role: 'Host', status: 'accepted' }, { id: 'meld', role: 'Co-host', status: 'pending' }] }),
    plan({ id: 'breakfast', title: 'Founders breakfast', stage: 'pencil', hold: '2026-10-27' }),
    plan({ id: 'solstice', title: 'Winter solstice', stage: 'pencil', hold: '2026-11-02' }),
    plan({ id: 'old', title: 'Garden day', stage: 'pencil', hold: '2026-10-19' }),
    plan({ id: 'bath', title: 'Sound bath', stage: 'production' }),
  ],
  items: [
    item({ id: 'o1', plan: 'solstice', date: '2026-11-01', option: 'A' }),
    item({ id: 'o2', plan: 'solstice', date: '2026-11-02', option: 'B' }),
    item({ id: 'o3', plan: 'solstice', date: '2026-11-03', option: 'C' }),
    item({ id: 'stretch', title: 'Sunset stretch', kind: 'planning' }),
    item({ id: 'repairs', title: 'Pool deck repairs', kind: 'unavailable', date: '2026-10-26', end: '2026-10-28', startMin: null }),
  ],
  tasks: [
    task({ id: 'gong', title: 'Confirm gong practitioner', due: '2026-10-15' }),
    task({ id: 'fine', due: '2026-10-21' }),
    task({ id: 'done', due: '2026-10-01', done: true }),
    task({ id: 'u1' }),
    task({ id: 'u2' }),
  ],
}

describe('needsYou', () => {
  const out = needsYou(data, today, own, names)
  it('lists in the order invites, overdue, clashes, holds, publish, undated', () => {
    expect(out.map((e) => e.kind)).toEqual(['invite', 'overdue', 'clash', 'hold', 'hold', 'lapsed', 'publish', 'undated'])
    expect(out.map((e) => e.id)).toEqual([
      'inv-beach', 'late-gong', 'clash-stretch', 'hold-breakfast', 'hold-solstice', 'hold-old', 'pub-bath', 'undated',
    ])
  })
  it('names the host in the invite, and leaves the invite out of the holds', () => {
    expect(out[0]).toMatchObject({ text: 'Swami\'s Beach invited you to co-host', sub: 'Beach clean', action: 'Accept', op: 'accept', tone: 'var(--live)' })
    expect(out.some((e) => e.id === 'hold-beach')).toBe(false)
  })
  it('words overdue, clash and hold entries', () => {
    expect(out[1]).toMatchObject({ text: 'Confirm gong practitioner', sub: 'Overdue since Thu, Oct 15', action: 'Do today', op: 'today' })
    expect(out[2]).toMatchObject({ text: 'Sunset stretch overlaps unavailable time', sub: 'Tue, Oct 27', op: 'open' })
    expect(out[3]).toMatchObject({ text: 'Founders breakfast is pencilled', sub: 'Hold ends Oct 27', action: 'Confirm' })
    expect(out[4]).toMatchObject({ text: 'Winter solstice has 3 dates pencilled', sub: 'Hold ends Nov 2', action: 'Pick one' })
  })
  it('says so when a hold has lapsed', () => {
    expect(out[5]).toMatchObject({ text: 'The hold on Garden day has lapsed', sub: 'Hold ended Oct 19', tone: 'var(--live)' })
  })
  it('asks to publish a production and counts the undated to-dos', () => {
    expect(out[6]).toMatchObject({ text: 'Sound bath is ready to go live', sub: 'Production · not public yet', action: 'Publish' })
    expect(out[7]).toMatchObject({ text: '2 to-dos have no date', sub: 'Drag them onto a day', op: 'inbox', ref: '' })
  })
  it('singularises one undated to-do', () => {
    const one = needsYou({ ...data, plans: [], items: [], tasks: [task({ id: 'x' })] }, today, own)
    expect(one[0].text).toBe('1 to-do has no date')
  })
  it('falls back when the host Space has no name on file', () => {
    expect(needsYou(data, today, own, {})[0].text).toBe('Another Space invited you to co-host')
  })
  it('is empty when nothing waits', () => {
    expect(needsYou({ plans: [], items: [], tasks: [] }, today, own)).toEqual([])
  })
  it('does not count an outgoing invite as an invite', () => {
    const outgoing = plan({ id: 'o', spaces: [{ id: 'meld', role: 'Host', status: 'accepted' }, { id: 'vine', role: 'Co-host', status: 'pending' }] })
    expect(needsYou({ plans: [outgoing], items: [], tasks: [] }, today, own)).toEqual([])
  })
})
