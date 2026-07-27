import { describe, it, expect } from 'vitest'
import { orderByBox } from './settings-panel'

// The rail's box nesting (ADR-846). The catalog expresses the 12-box shape through `parent`; this
// is the ordering that turns it into boxes-with-tools on screen instead of one flat list.
// Real catalog ids: space.crm owns space.leads/.doors/.shared/.automation/.conversations;
// space.offerings owns space.booking/.tickets; space.calendar is a box with no children.

describe('orderByBox', () => {
  it('leaves non-Space scopes completely flat', () => {
    const ids = ['circle.settings', 'circle.people']
    expect(orderByBox(ids, false)).toEqual([
      { id: 'circle.settings', depth: 0 },
      { id: 'circle.people', depth: 0 },
    ])
  })

  it('pulls a box’s tools up directly beneath it, at depth 1', () => {
    const out = orderByBox(['space.crm', 'space.calendar', 'space.leads'], true)
    expect(out).toEqual([
      { id: 'space.crm', depth: 0 },
      { id: 'space.leads', depth: 1 },
      { id: 'space.calendar', depth: 0 },
    ])
  })

  it('keeps a box with no children at depth 0', () => {
    expect(orderByBox(['space.calendar'], true)).toEqual([{ id: 'space.calendar', depth: 0 }])
  })

  it('FAIL-SAFE: renders an orphan tool flat rather than dropping it', () => {
    // space.leads without its space.crm parent in the same section (gated out for this viewer).
    const out = orderByBox(['space.calendar', 'space.leads'], true)
    expect(out).toEqual([
      { id: 'space.calendar', depth: 0 },
      { id: 'space.leads', depth: 0 },
    ])
  })

  it('never drops or duplicates an id, whatever the shape', () => {
    const ids = ['space.leads', 'space.crm', 'space.doors', 'space.calendar', 'space.booking']
    const out = orderByBox(ids, true)
    expect(out).toHaveLength(ids.length)
    expect(new Set(out.map((o) => o.id))).toEqual(new Set(ids))
  })

  it('handles an empty section', () => {
    expect(orderByBox([], true)).toEqual([])
  })
})
