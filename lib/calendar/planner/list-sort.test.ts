import { describe, expect, it } from 'vitest'
import { buildBoard } from './board'
import { firstDir, sortCards } from './list-sort'
import type { PlannerData, PlannerItem, PlannerPlan, PlannerTask } from './types'

const today = '2026-10-21'
const plan = (id: string, title: string, stage: PlannerPlan['stage'] = 'planning'): PlannerPlan => ({
  id,
  title,
  stage,
  target: 'Event',
  team: [],
  spaces: [{ id: 'own', role: 'Host', status: 'accepted' }],
})
const item = (id: string, planId: string, date: string): PlannerItem => ({
  id,
  title: id,
  kind: 'planning',
  date,
  startMin: null,
  durMin: 60,
  plan: planId,
})
const task = (id: string, planId: string, done: boolean, due: string | null = '2026-10-30'): PlannerTask => ({
  id,
  title: id,
  due,
  done,
  plan: planId,
})

const data: PlannerData = {
  plans: [plan('a', 'Beach clean'), plan('b', 'Autumn retreat'), plan('c', 'Craft night'), plan('d', 'Dance night')],
  items: [item('ia', 'a', '2026-11-05'), item('ib', 'b', '2026-10-24'), item('ic', 'c', '2026-12-01')],
  tasks: [task('t1', 'a', true), task('t2', 'a', false), task('t3', 'b', false, '2026-10-01'), task('t4', 'c', true)],
}
const cards = () => buildBoard(data, today, 'own')[1].cards
const ids = (list: ReturnType<typeof cards>) => list.map((c) => c.id)

describe('sortCards', () => {
  it('sorts by Plan name both ways', () => {
    expect(ids(sortCards(cards(), 'plan', 'asc'))).toEqual(['b', 'a', 'c', 'd'])
    expect(ids(sortCards(cards(), 'plan', 'desc'))).toEqual(['d', 'c', 'a', 'b'])
  })
  it('sorts by next date and keeps a Plan with no date last in both directions', () => {
    expect(ids(sortCards(cards(), 'next', 'asc'))).toEqual(['b', 'a', 'c', 'd'])
    expect(ids(sortCards(cards(), 'next', 'desc'))).toEqual(['c', 'a', 'b', 'd'])
  })
  it('sorts by how much of the to-dos are done', () => {
    // a is 1 of 2 (50), b is 0 of 1 (0), c is 1 of 1 (100), d has none (0).
    expect(ids(sortCards(cards(), 'todos', 'desc'))).toEqual(['c', 'a', 'b', 'd'])
    expect(ids(sortCards(cards(), 'todos', 'asc'))).toEqual(['b', 'd', 'a', 'c'])
  })
  it('sorts by health with the Plans that need a look first', () => {
    // b has an overdue to-do, d needs a date, a and c are on track.
    expect(ids(sortCards(cards(), 'health', 'asc'))).toEqual(['b', 'd', 'a', 'c'])
  })
  it('does not change the list it was given', () => {
    const before = cards()
    const copy = ids(before)
    sortCards(before, 'plan', 'desc')
    expect(ids(before)).toEqual(copy)
  })
})

describe('firstDir', () => {
  it('opens to-dos with the most done first and the rest forward', () => {
    expect(firstDir('todos')).toBe('desc')
    expect(firstDir('plan')).toBe('asc')
    expect(firstDir('next')).toBe('asc')
    expect(firstDir('health')).toBe('asc')
  })
})
