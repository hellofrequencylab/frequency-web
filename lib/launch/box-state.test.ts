import { describe, it, expect } from 'vitest'
import { boxView } from './box-state'
import { publishStep, skipStep, startStep, toSnapshot } from './state'

const t0 = new Date('2026-10-28T12:00:00Z')
const row = (over: Record<string, unknown> = {}) =>
  toSnapshot({ id: 'l1', owner_id: 'p1', started_at: t0.toISOString(), updated_at: t0.toISOString(), niche: 'coaches', intents: [], steps: {}, ...over })!

describe('the launch box view (VLS-08)', () => {
  it('a new launch reads nothing made, the Spotlight as next, and nine steps in three stages', () => {
    const v = boxView(row(), t0)
    expect(v).toMatchObject({ total: 9, done: 0, pct: 0, minimized: false, stopAsked: false, current: { id: 'spotlight', label: 'Spotlight' } })
    expect(v.stages.map((s) => s.label)).toEqual(['Be found', 'Gather people', 'Keep them'])
    expect(v.stages.flatMap((s) => s.rows).filter((r) => r.state === 'now')).toHaveLength(1)
  })

  it('counts made steps, treats a skip as settled but not made, and moves "now" along', () => {
    let steps = publishStep(startStep({}, 'spotlight', t0), 'spotlight', t0)
    steps = skipStep(publishStep(steps, 'space', t0), 'offer', t0)!
    const v = boxView(row({ steps }), t0)
    expect(v.done).toBe(2)
    expect(v.pct).toBe(Math.round((3 / 9) * 100))
    expect(v.current?.id).toBe('website')
    const states = Object.fromEntries(v.stages.flatMap((s) => s.rows).map((r) => [r.id, r.state]))
    expect(states).toMatchObject({ spotlight: 'done', space: 'done', offer: 'skipped', website: 'now', people: 'todo' })
  })

  it('has no current step once every step is settled', () => {
    let steps = {}
    for (const id of ['spotlight', 'space', 'website', 'people'] as const) steps = publishStep(steps, id, t0)
    for (const id of ['offer', 'event', 'circle', 'journey', 'paid'] as const) steps = skipStep(steps, id, t0)!
    const v = boxView(row({ steps, niche: 'coaches' }), t0)
    expect(v.current).toBeNull()
    expect(v.pct).toBe(100)
  })

  it('follows the person\'s own order and carries the minimized flag and a waiting stop', () => {
    const v = boxView(row({ niche: 'studios', minimized: true, cancel_requested_at: t0.toISOString() }), new Date(t0.getTime() + 1000))
    expect(v.minimized).toBe(true)
    expect(v.stopAsked).toBe(true)
    expect(v.stages[1].rows[0].id).toBe('event')
    expect(boxView(row({ cancel_requested_at: t0.toISOString() }), new Date(t0.getTime() + 60 * 60 * 1000)).stopAsked).toBe(false)
  })

  it('carries step labels from the registry only, never a person\'s own text', () => {
    const v = boxView(row({ steps: { spotlight: { status: 'published', ref: 'a private word' } } }), t0)
    expect(JSON.stringify(v)).not.toContain('a private word')
  })
})
