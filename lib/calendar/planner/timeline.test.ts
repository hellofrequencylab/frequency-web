import { describe, expect, it } from 'vitest'
import { TIMELINE_DAYS, buildTimeline, dueState } from './timeline'
import type { PlannerData, PlannerItem, PlannerPlan, PlannerTask } from './types'

const today = '2026-10-21' // a Wednesday; this week's Monday is Oct 19; the span starts a week earlier, Oct 12, and ends Dec 14
const plan = (o: Partial<PlannerPlan> & { id: string }): PlannerPlan => ({
  title: o.id, stage: 'planning', target: 'Event', team: ['dt'], spaces: [], ...o,
})
const item = (o: Partial<PlannerItem> & { id: string; plan: string }): PlannerItem => ({
  title: o.id, kind: 'planning', date: '2026-10-30', startMin: null, durMin: 60, ...o,
})
const task = (o: Partial<PlannerTask> & { id: string }): PlannerTask => ({ title: o.id, due: null, done: false, ...o })
const data = (o: Partial<PlannerData>): PlannerData => ({ items: [], tasks: [], plans: [], ...o })

describe('buildTimeline', () => {
  it('starts nine weeks from last Monday and labels each week', () => {
    const t = buildTimeline(data({}), today)
    expect(t.start).toBe('2026-10-12')
    expect(t.weeks).toHaveLength(9)
    expect(t.weeks[0]).toEqual({ label: 'Oct 12', leftPct: 0 })
    expect(t.weeks[1].label).toBe('Oct 19')
    expect(t.weeks[8].label).toBe('Dec 7')
    expect(t.weeks[1].leftPct).toBeCloseTo(100 / 9, 6)
  })
  it('puts today on the line', () => {
    expect(buildTimeline(data({}), today).todayPct).toBeCloseTo((9 * 100) / TIMELINE_DAYS, 6)
  })
  it('drops cancelled Plans', () => {
    const t = buildTimeline(data({ plans: [plan({ id: 'a' }), plan({ id: 'b', stage: 'cancelled' })] }), today)
    expect(t.rows.map((r) => r.id)).toEqual(['a'])
  })
  it('draws a bar over dates and dues, and a mark per date', () => {
    const d = data({
      plans: [plan({ id: 'a', stage: 'production' })],
      items: [item({ id: 'd1', plan: 'a', date: '2026-10-26', end: '2026-10-28', kind: 'production' })],
      tasks: [task({ id: 't', plan: 'a', due: '2026-10-19' })],
    })
    const [row] = buildTimeline(d, today).rows
    // Bar: Oct 19 (day 7) through Oct 28 inclusive (end Oct 29 = day 17): 10 days wide.
    expect(row.bar.leftPct).toBeCloseTo((7 * 100) / 63, 6)
    expect(row.bar.widthPct).toBeCloseTo((10 * 100) / 63, 6)
    expect(row.bar.startsBefore).toBe(false)
    expect(row.bar.bd).toContain('24%')
    expect(row.marks[0].widthPct).toBeCloseTo((3 * 100) / 63, 6)
    expect(row.marks[0].color).toBe('var(--cal-production)')
    expect(row.marks[0].title).toBe('d1 · Mon, Oct 26')
  })
  it('floors a one day mark at 1.6 percent', () => {
    // One day is 1.587 percent of the span, just under the floor.
    const d = data({ plans: [plan({ id: 'a' })], items: [item({ id: 'd', plan: 'a' })] })
    expect(buildTimeline(d, today).rows[0].marks[0].widthPct).toBe(1.6)
  })
  it('sits a Plan with no dates at today', () => {
    const [row] = buildTimeline(data({ plans: [plan({ id: 'a' })] }), today).rows
    expect(row.bar.leftPct).toBeCloseTo((9 * 100) / 63, 6)
    expect(row.health.label).toBe('Needs a date')
  })
  it('says when a bar runs past either edge instead of faking a date', () => {
    const d = data({
      plans: [plan({ id: 'a' }), plan({ id: 'b' })],
      items: [item({ id: 'i1', plan: 'a', date: '2026-09-01' }), item({ id: 'i2', plan: 'b', date: '2027-02-01' })],
    })
    const [a, b] = buildTimeline(d, today).rows
    expect(a.bar.startsBefore).toBe(true)
    expect(a.bar.leftPct).toBe(0)
    expect(b.bar.endsAfter).toBe(true)
    expect(b.bar.leftPct + b.bar.widthPct).toBeLessThanOrEqual(100 + 1e-9)
  })
  it('colours dues upcoming, overdue and done', () => {
    expect(dueState('2026-10-25', false, today)).toBe('upcoming')
    expect(dueState('2026-10-21', false, today)).toBe('upcoming')
    expect(dueState('2026-10-20', false, today)).toBe('overdue')
    expect(dueState('2026-10-01', true, today)).toBe('done')
    const d = data({
      plans: [plan({ id: 'a' })],
      items: [item({ id: 'i', plan: 'a' })],
      tasks: [task({ id: 'u', plan: 'a', due: '2026-10-25' }), task({ id: 'o', plan: 'a', due: '2026-10-10' }), task({ id: 'x', plan: 'a', due: '2026-10-10', done: true }), task({ id: 'n', plan: 'a' })],
    })
    const dues = buildTimeline(d, today).rows[0].dues
    expect(dues.map((x) => [x.id, x.state, x.color])).toEqual([
      ['u', 'upcoming', 'var(--reward)'],
      ['o', 'overdue', 'var(--live)'],
      ['x', 'done', 'var(--text-faint)'],
    ])
    expect(dues[0].title).toBe('u · due Sun, Oct 25')
  })
  it('places a hold', () => {
    const d = data({ plans: [plan({ id: 'a', stage: 'pencil', hold: '2026-10-28' })] })
    expect(buildTimeline(d, today).rows[0].holdPct).toBeCloseTo((16 * 100) / 63, 6)
  })
})
