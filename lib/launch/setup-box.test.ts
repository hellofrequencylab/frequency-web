import { describe, expect, it } from 'vitest'
import { setupBoxView, spaceOnlySetupBoxView } from './setup-box'
import { toSnapshot } from './state'
import type { InventorySection } from './overview'

const t0 = new Date('2026-10-29T12:00:00Z')
const launch = toSnapshot({ id: 'l1', owner_id: 'p1', started_at: t0.toISOString(), updated_at: t0.toISOString(), niche: null, intents: [], steps: {} })!
const item = (id: string, state: 'done' | 'todo', extra: Record<string, unknown> = {}) => ({ id, label: id, state, ...extra })
const sections = (states: ('done' | 'todo')[]): InventorySection[] => [
  { id: 'spotlight', title: 'Spotlight', items: [item('sp-live', states[0]!)] },
  { id: 'space', title: 'Space', items: [item('sc-name', states[1]!), item('sc-cover', states[2]!, { photo: true, skipped: true })] },
] as InventorySection[]

describe('the Finish setup box (LIVE-1914)', () => {
  it('counts the Get Started list and names what is left, next one first', () => {
    const v = setupBoxView(launch, sections(['done', 'done', 'todo']), t0)!
    expect(v.setup).toMatchObject({ done: 2, total: 3, left: 1, pct: 67 })
    expect(v.setup!.todo.map((t) => t.id)).toEqual(['sc-cover'])
    expect(v.setup!.todo[0]).toMatchObject({ photo: true, skipped: true, href: '/launch/step/space' })
    expect(v.setup!.sections).toEqual([
      { id: 'spotlight', title: 'Spotlight', done: 1, total: 1 },
      { id: 'space', title: 'Space', done: 1, total: 2 },
    ])
  })
  it('stands down when every item is done', () => {
    expect(setupBoxView(launch, sections(['done', 'done', 'done']), t0)).toBeNull()
  })
  it('shows at most six still-to-do items so the sheet stays a glance', () => {
    const many: InventorySection[] = [{ id: 'space', title: 'Space', items: Array.from({ length: 9 }, (_, i) => item(`i${i}`, 'todo')) }] as InventorySection[]
    expect(setupBoxView(launch, many, t0)!.setup!.todo).toHaveLength(6)
  })
})

describe('the Finish setup box for a Space with no launch', () => {
  it('shows over the Space\'s list while the Spotlight is not live, Spotlight first', () => {
    const v = spaceOnlySetupBoxView('p1', 's1', sections(['todo', 'done', 'todo']), t0)!
    expect(v.setup!.todo[0]).toMatchObject({ id: 'sp-live', href: '/launch/step/spotlight' })
    expect(v.setup).toMatchObject({ done: 1, total: 3 })
  })
  it('stands down once the Spotlight is live or the list is complete', () => {
    expect(spaceOnlySetupBoxView('p1', 's1', sections(['done', 'done', 'todo']), t0)).toBeNull()
    expect(spaceOnlySetupBoxView('p1', 's1', sections(['done', 'done', 'done']), t0)).toBeNull()
  })
})
