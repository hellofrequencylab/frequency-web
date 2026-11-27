import { describe, expect, it } from 'vitest'
import { commandRows } from './command-results'

const views = ['month', 'week', 'agenda', 'plans'] as const
const plans = [
  { id: 'p1', title: 'Supper club', stage: 'pencil' as const },
  { id: 'p2', title: 'Sound bath under the new moon', stage: 'event' as const },
]
const items = [{ id: 'i1', title: 'Supper club setup', kind: 'planning' as const, date: '2026-10-23' }]

describe('commandRows', () => {
  it('with nothing typed offers the views and today', () => {
    const rows = commandRows({ query: '', create: null, views, plans, items })
    expect(rows.map((r) => r.label)).toEqual(['Open Month view', 'Open Week view', 'Open Agenda view', 'Open Plans view', 'Jump to today'])
    expect(rows[0]).toMatchObject({ meta: 'Press M' })
    expect(rows[4]).toMatchObject({ meta: 'Press T' })
  })
  it('puts the create row first once there are three letters to read', () => {
    const create = { kind: 'pencil' as const, label: 'Add pencil: Supper club', meta: 'Fri, Oct 23, 7 PM' }
    expect(commandRows({ query: 'su', create, views, plans, items })[0].type).not.toBe('create')
    const rows = commandRows({ query: 'supper club fri', create, views, plans, items })
    expect(rows[0]).toMatchObject({ type: 'create', label: 'Add pencil: Supper club', meta: 'Fri, Oct 23, 7 PM' })
  })
  it('finds Plans and dates by title and names what they are', () => {
    const rows = commandRows({ query: 'supper', create: null, views, plans, items })
    expect(rows.map((r) => [r.type, r.meta])).toEqual([
      ['plan', 'Plan · Pencil'],
      ['item', 'Planning · Fri, Oct 23'],
    ])
  })
  it('names a published Plan Published, and filters views by what was typed', () => {
    expect(commandRows({ query: 'sound', create: null, views, plans, items })[0].meta).toBe('Plan · Published')
    expect(commandRows({ query: 'we', create: null, views, plans, items }).map((r) => r.id)).toEqual(['view:week'])
    expect(commandRows({ query: 'go ag', create: null, views, plans, items }).map((r) => r.id)).toEqual(['view:agenda'])
  })
  it('never lists more than nine rows', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, title: `Thing ${i}`, kind: 'private' as const, date: '2026-10-23' }))
    const rows = commandRows({ query: 'thing', create: null, views, plans: [], items: many })
    expect(rows.length).toBeLessThanOrEqual(9)
    expect(rows).toHaveLength(4)
  })
  it('offers Ask Vera last for anything typed, only to someone who may change the calendar', () => {
    const rows = commandRows({ query: 'move supper club to 8pm', create: null, views, plans, items, vera: true })
    expect(rows.at(-1)).toEqual({ id: 'vera', type: 'vera', ask: 'move supper club to 8pm', label: 'Ask Vera: move supper club to 8pm', meta: 'Proposes changes' })
    expect(commandRows({ query: 'move supper club to 8pm', create: null, views, plans, items }).some((r) => r.type === 'vera')).toBe(false)
    expect(commandRows({ query: 'mo', create: null, views, plans, items, vera: true }).some((r) => r.type === 'vera')).toBe(false)
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, title: `Thing ${i}`, kind: 'private' as const, date: '2026-10-23' }))
    const full = commandRows({ query: 'thing', create: null, views, plans: [], items: many, vera: true })
    expect(full.length).toBeLessThanOrEqual(9)
    expect(full.at(-1)?.type).toBe('vera')
  })
})
