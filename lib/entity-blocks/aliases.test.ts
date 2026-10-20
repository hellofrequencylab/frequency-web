import { describe, it, expect } from 'vitest'
import { BLOCK_ID_ALIASES, applyBlockAliases, resolveBlockId } from './aliases'
import { parseEntityLayout, type EntityLayout } from './layout'

const aliases = new Map([['old', 'new']])

describe('read-time block aliases', () => {
  it('ships empty, so reading is unchanged until a retirement is approved', () => {
    expect(BLOCK_ID_ALIASES.size).toBe(0)
    const layout: EntityLayout = { order: ['text'], hidden: ['old'] }
    expect(applyBlockAliases(layout)).toBe(layout)
  })

  it('resolves one hop and leaves other ids alone', () => {
    expect(resolveBlockId('old', aliases)).toBe('new')
    expect(resolveBlockId('text', aliases)).toBe('text')
  })

  it('rewrites rows, slots, hidden, order, content and style, without duplicates', () => {
    const layout: EntityLayout = {
      rows: [{ id: 'r1', columns: 2, cells: [['old', 'new'], ['text']] }],
      slots: { main: ['old', 'text'] },
      hidden: ['old'],
      order: ['old', 'new'],
      content: { old: { a: 1 }, text: { b: 2 } },
      style: { old: {} },
    }
    const out = applyBlockAliases(layout, aliases)
    expect(out.rows?.[0].cells).toEqual([['new'], ['text']])
    expect(out.slots).toEqual({ main: ['new', 'text'] })
    expect(out.hidden).toEqual(['new'])
    expect(out.order).toEqual(['new'])
    expect(out.content).toEqual({ new: { a: 1 }, text: { b: 2 } })
    expect(out.style).toEqual({ new: {} })
    expect(layout.hidden).toEqual(['old'])
  })

  it('lets the new key win when both carry content', () => {
    const out = applyBlockAliases({ content: { old: { a: 1 }, new: { a: 2 } } }, aliases)
    expect(out.content).toEqual({ new: { a: 2 } })
  })

  it('leaves parseEntityLayout unchanged while the map is empty', () => {
    expect(parseEntityLayout({ order: ['text'] })).toMatchObject({ order: ['text'] })
  })
})
