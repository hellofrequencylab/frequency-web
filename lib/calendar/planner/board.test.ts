import { describe, expect, it } from 'vitest'
import { STAGES, buildBoard, listGroups, planStats, stageLabel } from './board'
import type { PlannerData, PlannerItem, PlannerPlan, PlannerTask } from './types'

const today = '2026-10-21'
const plan = (o: Partial<PlannerPlan> & { id: string }): PlannerPlan => ({
  title: o.id, stage: 'planning', target: 'Event', team: ['dt'], spaces: [{ id: 'meld', role: 'Host', status: 'accepted' }], ...o,
})
const item = (o: Partial<PlannerItem> & { id: string; plan: string }): PlannerItem => ({
  title: o.id, kind: 'planning', date: '2026-10-30', startMin: 1080, durMin: 60, ...o,
})
const task = (o: Partial<PlannerTask> & { id: string }): PlannerTask => ({ title: o.id, due: null, done: false, ...o })
const data = (o: Partial<PlannerData>): PlannerData => ({ items: [], tasks: [], plans: [], ...o })

describe('stages', () => {
  it('run pencil, planning, production, published, cancelled', () => {
    expect(STAGES.map((s) => s.key)).toEqual(['pencil', 'planning', 'production', 'event', 'cancelled'])
    expect(STAGES.map((s) => s.label)).toEqual(['Pencil', 'Planning', 'Production', 'Published', 'Cancelled'])
    expect(stageLabel('event')).toBe('Published')
    expect(stageLabel('mystery')).toBe('mystery')
  })
})

describe('health', () => {
  const p = plan({ id: 'p' })
  const withItem = [item({ id: 'i', plan: 'p' })]
  it('needs a date with no items, even when to-dos are late', () => {
    const d = data({ plans: [p], tasks: [task({ id: 't', plan: 'p', due: '2026-10-01' })] })
    expect(planStats(p, d, today).health.label).toBe('Needs a date')
  })
  it('counts overdue to-dos, open ones only', () => {
    const d = data({
      items: withItem,
      tasks: [
        task({ id: 'a', plan: 'p', due: '2026-10-01' }),
        task({ id: 'b', plan: 'p', due: '2026-10-05' }),
        task({ id: 'c', plan: 'p', due: '2026-10-05', done: true }),
        task({ id: 'd', plan: 'p', due: '2026-10-21' }),
        task({ id: 'e', plan: 'p', due: null }),
      ],
    })
    const s = planStats(p, d, today)
    expect(s.health).toMatchObject({ key: 'overdue', label: '2 overdue', fg: 'var(--live)' })
    expect(s.late).toBe(2)
    expect(s.pct).toBe(20)
  })
  it('is Holding while pencilled and On track otherwise', () => {
    const pencil = plan({ id: 'p', stage: 'pencil', hold: '2026-10-27' })
    expect(planStats(pencil, data({ items: withItem }), today).health.label).toBe('Holding')
    expect(planStats(p, data({ items: withItem }), today).health.label).toBe('On track')
  })
  it('says Hold lapsed once the hold date has passed', () => {
    const pencil = plan({ id: 'p', stage: 'pencil', hold: '2026-10-20' })
    expect(planStats(pencil, data({ items: withItem }), today).health.label).toBe('Hold lapsed')
  })
  it('does not call a cancelled Plan overdue', () => {
    const c = plan({ id: 'p', stage: 'cancelled' })
    const d = data({ items: withItem, tasks: [task({ id: 'a', plan: 'p', due: '2026-10-01' })] })
    expect(planStats(c, d, today).health.label).toBe('Cancelled')
  })
  it('picks the next date from today on, else the last', () => {
    const d = data({ items: [item({ id: 'a', plan: 'p', date: '2026-10-01' }), item({ id: 'b', plan: 'p', date: '2026-11-05' }), item({ id: 'c', plan: 'p', date: '2026-10-25' })] })
    expect(planStats(p, d, today).next?.id).toBe('c')
    const past = data({ items: [item({ id: 'a', plan: 'p', date: '2026-10-01' }), item({ id: 'b', plan: 'p', date: '2026-10-10' })] })
    expect(planStats(p, past, today).next?.id).toBe('b')
  })
  it('says nothing about a hold when the Plan is not pencilled', () => {
    expect(planStats(plan({ id: 'p', stage: 'planning', hold: '2026-10-27' }), data({ items: withItem }), today).hold).toBe('')
  })
})

describe('buildBoard and listGroups', () => {
  const plans = [
    plan({ id: 'a', title: 'Founders breakfast', stage: 'pencil', hold: '2026-10-22' }),
    plan({ id: 'b', title: 'Breathwork', stage: 'planning' }),
    plan({ id: 'c', title: 'Kids art morning', stage: 'planning' }),
    plan({ id: 'd', title: 'Beach clean', stage: 'pencil', spaces: [{ id: 'swami', role: 'Host', status: 'accepted' }, { id: 'meld', role: 'Co-host', status: 'pending' }] }),
  ]
  const d = data({
    plans,
    items: [item({ id: '1', plan: 'a' }), item({ id: '2', plan: 'a', date: '2026-11-02' }), item({ id: '3', plan: 'b' })],
    tasks: [task({ id: 't1', plan: 'b', done: true }), task({ id: 't2', plan: 'b' })],
  })
  const cols = buildBoard(d, today, 'meld')
  it('always returns the five columns', () => {
    expect(cols.map((c) => c.key)).toEqual(['pencil', 'planning', 'production', 'event', 'cancelled'])
    expect(cols[0].cards.map((c) => c.id)).toEqual(['a', 'd'])
  })
  it('words the card', () => {
    const a = cols[0].cards[0]
    expect(a.when).toBe('Fri, Oct 30 · 2 dates')
    expect(a.hold).toBe('Holding until Oct 22 · 1 day left')
    expect(a.tasks).toBe('No to-dos yet')
    const b = cols[1].cards[0]
    expect(b.tasks).toBe('1 of 2 to-dos')
    expect(b.pct).toBe(50)
    expect(cols[1].cards[1].when).toBe('No date yet')
    expect(cols[1].cards[1].health.label).toBe('Needs a date')
  })
  it('marks shared Plans and incoming invites', () => {
    const beach = cols[0].cards[1]
    expect(beach).toMatchObject({ shared: true, invitePending: true, partnerSpaceIds: ['swami'] })
    expect(cols[0].cards[0].shared).toBe(false)
  })
  it('lists only the stages that hold a Plan', () => {
    expect(listGroups(cols).map((c) => c.key)).toEqual(['pencil', 'planning'])
  })
})
