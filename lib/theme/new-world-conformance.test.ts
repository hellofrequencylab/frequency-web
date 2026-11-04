import { describe, expect, it } from 'vitest'
import { newWorldConformance } from './new-world-conformance'

// LIVE-2205: the live conformance page lists the handoff's ten invariants for New World, in order, and never passes a check it
// could not run.
describe('New World conformance, live', () => {
  const rows = newWorldConformance()
  it('lists the ten invariants in the handoff order', () => {
    const n = rows.map((r) => Number(r.name.split(' ')[0]))
    expect([...new Set(n)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
  it('passes every check it can run against the code today, except where an owner rule wins', () => {
    expect(rows.filter((r) => r.result === 'fail')).toEqual([])
    for (const r of rows.filter((x) => x.result === 'ruled')) expect(r.id).toBe('contrast-button')
  })
  it('skips, with a reason, only the checks that need a browser or the theme editor dials', () => {
    const skipped = rows.filter((r) => r.result === 'skip')
    expect(skipped.map((r) => r.id)).toEqual(['height', 'empty-states', 'reset', 'repaint'])
    for (const r of skipped) expect(r.detail.length).toBeGreaterThan(20)
  })
  it('writes no em dash in what it shows', () => {
    for (const r of rows) expect(`${r.name} ${r.detail}`).not.toMatch(/—/)
  })
})
