import { describe, expect, it } from 'vitest'
import { dayItems, hostSpaceId, isInvitePending, isItemVisible, isShared, partnerSpaceId } from './day-items'
import type { PlannerData, PlannerItem, PlannerPlan, PlannerTask } from './types'

const own = 'meld'
const item = (o: Partial<PlannerItem> & { id: string }): PlannerItem => ({
  title: o.id,
  kind: 'event',
  date: '2026-10-21',
  startMin: null,
  durMin: 60,
  ...o,
})
const plan = (o: Partial<PlannerPlan> & { id: string }): PlannerPlan => ({
  title: o.id,
  stage: 'planning',
  target: 'Event',
  team: [],
  spaces: [{ id: 'meld', role: 'Host', status: 'accepted' }],
  ...o,
})
const task = (o: Partial<PlannerTask> & { id: string }): PlannerTask => ({ title: o.id, due: null, done: false, ...o })

describe('plan questions', () => {
  const shared = plan({
    id: 'p',
    spaces: [
      { id: 'ocean', role: 'Host', status: 'accepted' },
      { id: 'meld', role: 'Co-host', status: 'pending' },
    ],
  })
  it('knows shared, pending, partner and host', () => {
    expect(isShared(shared, own)).toBe(true)
    expect(isShared(plan({ id: 'solo' }), own)).toBe(false)
    expect(isShared(null, own)).toBe(false)
    expect(isInvitePending(shared, own)).toBe(true)
    expect(partnerSpaceId(shared, own)).toBe('ocean')
    expect(hostSpaceId(shared)).toBe('ocean')
  })
  it('does not call an outgoing invite pending for this Space', () => {
    const out = plan({
      id: 'o',
      spaces: [
        { id: 'meld', role: 'Host', status: 'accepted' },
        { id: 'vine', role: 'Co-host', status: 'pending' },
      ],
    })
    expect(isInvitePending(out, own)).toBe(false)
    expect(hostSpaceId(out)).toBe('meld')
  })
})

describe('dayItems', () => {
  const data: PlannerData = {
    plans: [
      plan({
        id: 'sh',
        spaces: [
          { id: 'meld', role: 'Host', status: 'accepted' },
          { id: 'ocean', role: 'Co-host', status: 'accepted' },
        ],
      }),
    ],
    items: [
      item({ id: 'late', startMin: 18 * 60 }),
      item({ id: 'early', startMin: 9 * 60 }),
      item({ id: 'allday' }),
      item({ id: 'band', date: '2026-10-20', end: '2026-10-22', kind: 'unavailable' }),
      item({ id: 'other-day', date: '2026-10-22' }),
      item({ id: 'shared', plan: 'sh', startMin: 600 }),
    ],
    tasks: [task({ id: 't', due: '2026-10-21' }), task({ id: 'u', due: '2026-10-22' })],
  }
  it('puts bands and all-day first, then by start, and spans multi-day items', () => {
    const { items, todos } = dayItems(data, '2026-10-21', own)
    expect(items.map((i) => i.id)).toEqual(['allday', 'band', 'early', 'shared', 'late'])
    expect(todos.map((t) => t.id)).toEqual(['t'])
  })
  it('honours the Show tiles', () => {
    expect(dayItems({ ...data, hidden: { unavailable: true } }, '2026-10-21', own).items.map((i) => i.id)).not.toContain('band')
    expect(dayItems({ ...data, hidden: { shared: true } }, '2026-10-21', own).items.map((i) => i.id)).not.toContain('shared')
    expect(dayItems({ ...data, hidden: { todos: true } }, '2026-10-21', own).todos).toEqual([])
  })
  it('hides cancelled items with the In the works tile', () => {
    const c = item({ id: 'c', kind: 'cancelled' })
    expect(isItemVisible({ ...data, hidden: { works: true } }, c, own)).toBe(false)
    expect(isItemVisible(data, c, own)).toBe(true)
  })
})
