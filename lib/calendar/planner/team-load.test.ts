import { describe, expect, it } from 'vitest'
import { paceOf, teamLoad } from './team-load'
import type { PlannerItem, PlannerTask } from './types'

const today = '2026-10-21'
const members = [{ id: 'dt', name: 'Daniel' }, { id: 'kp', name: 'Kai' }]
const task = (o: Partial<PlannerTask> & { id: string }): PlannerTask => ({ title: o.id, due: today, done: false, owner: 'dt', ...o })
const item = (o: Partial<PlannerItem> & { id: string }): PlannerItem => ({
  title: o.id, kind: 'planning', date: today, startMin: 600, durMin: 60, owner: 'dt', ...o,
})

describe('paceOf', () => {
  it('uses the prototype thresholds, exclusive at the edge', () => {
    expect(paceOf(0)).toBe('still')
    expect(paceOf(0.35)).toBe('still')
    expect(paceOf(0.36)).toBe('flow')
    expect(paceOf(0.75)).toBe('flow')
    expect(paceOf(0.76)).toBe('charge')
    expect(paceOf(1.4)).toBe('charge')
  })
})

describe('teamLoad', () => {
  it('counts open to-dos due by next week, overdue included, undated excluded', () => {
    const out = teamLoad(members, [
      task({ id: 'overdue', due: '2026-10-10', estHours: 2 }),
      task({ id: 'soon', due: '2026-10-28', estHours: 1 }),
      task({ id: 'later', due: '2026-10-29', estHours: 5 }),
      task({ id: 'done', done: true, estHours: 9 }),
      task({ id: 'inbox', due: null, estHours: 9 }),
      task({ id: 'default' }),
    ], [], today)
    expect(out.members[0].openTodos).toBe(3)
    expect(out.members[0].hours).toBe(3.5)
  })
  it('adds timed items this week and skips all-day, multi-day and cancelled ones', () => {
    const out = teamLoad(members, [], [
      item({ id: 'a', durMin: 90 }),
      item({ id: 'allday', startMin: null }),
      item({ id: 'band', end: '2026-10-23' }),
      item({ id: 'gone', kind: 'cancelled' }),
      item({ id: 'past', date: '2026-10-20' }),
      item({ id: 'far', date: '2026-10-29' }),
      item({ id: 'edge', date: '2026-10-28', durMin: 30 }),
      item({ id: 'someone', owner: 'kp', durMin: 120 }),
    ], today)
    expect(out.members[0].hours).toBe(2)
    expect(out.members[1].hours).toBe(2)
  })
  it('reads 20 hours as full and caps the bar', () => {
    const out = teamLoad(members, [task({ id: 'big', estHours: 25 })], [], today)
    expect(out.members[0]).toMatchObject({ pct: 100, full: true, hot: true, hoursLabel: '25 h' })
    const near = teamLoad(members, [task({ id: 'n', estHours: 19.8 })], [], today)
    expect(near.members[0].full).toBe(false)
    expect(near.members[0].pct).toBe(99)
  })
  it('flags hot above 16 hours only', () => {
    expect(teamLoad(members, [task({ id: 'x', estHours: 16 })], [], today).members[0].hot).toBe(false)
    expect(teamLoad(members, [task({ id: 'y', estHours: 16.5 })], [], today).members[0].hot).toBe(true)
  })
  it('derives the team pace from booked hours over capacity', () => {
    // 2 people x 20 h = 40 h capacity. 14 h = 35% (still), 14.5 h = 36% (flow), 30.5 h = 76% (charge).
    expect(teamLoad(members, [task({ id: 'a', estHours: 14 })], [], today).pace).toBe('still')
    const flow = teamLoad(members, [task({ id: 'a', estHours: 14.5 })], [], today)
    expect(flow.pace).toBe('flow')
    expect(flow.paceLabel).toBe('Flowing week')
    expect(flow.note).toBe('36% of team hours booked')
    const charge = teamLoad(members, [task({ id: 'a', estHours: 30.5 })], [], today)
    expect(charge.paceLabel).toBe('Charged week')
  })
  it('is a still week with no one on the team', () => {
    expect(teamLoad([], [], [], today)).toMatchObject({ pace: 'still', paceLabel: 'Still week', fill: 0, members: [] })
  })
})
