import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { basisFingerprint } from './check-adoption.mjs'
import { ANCHOR, measure, problems } from './check-block-baselines.mjs'

const live = JSON.parse(readFileSync('scripts/block-baselines.json', 'utf8'))
const clone = () => JSON.parse(JSON.stringify(live))

describe('check:block-baselines', () => {
  it('holds on the live tree', () => {
    const r = problems(live)
    expect(r.out).toEqual([])
    expect(r.code).toBe(0)
  })
  it('counts only manifest paths that exist', () => {
    const e = live.entries[0]
    expect(measure(e, () => true)).toBe(e.patterns.length)
    expect(measure(e, (p) => String(p) === e.patterns[0])).toBe(1)
  })
  it('fails when a block system is added (a rise)', () => {
    const c = clone()
    c.entries[0].baseline = 4
    c.entries[0].frozen.value = 4
    c.entries[0].frozen.basis = basisFingerprint(c.entries[0])
    const r = problems(c)
    expect(r.code).toBe(1)
    expect(r.out.join('\n')).toMatch(/above the frozen 4/)
  })
  it('fails when the number is hand-edited without a record', () => {
    const c = clone()
    c.entries[0].baseline = 9
    expect(problems(c).out.join('\n')).toMatch(/hand-edited/)
  })
  it('fails when the manifest changes under the number (basis moved)', () => {
    const c = clone()
    c.entries[0].patterns = c.entries[0].patterns.slice(1)
    expect(problems(c).out.join('\n')).toMatch(/measurement basis changed/)
  })
  it('exits 79 over nothing instead of reading as a win', () => {
    expect(problems(live, () => false).code).toBe(79)
    expect(problems({ entries: [] }).code).toBe(79)
    expect(ANCHOR).toBe('lib/entity-blocks/registry.ts')
  })
})
