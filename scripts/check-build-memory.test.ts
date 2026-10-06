import { describe, expect, it } from 'vitest'
import { BUDGET_MB, isNextProcess, judge } from './check-build-memory.mjs'

describe('check-build-memory (HYG-171)', () => {
  it('keeps a reserve under the 8 GB Standard build machine', () => {
    expect(BUDGET_MB).toBeLessThanOrEqual(7168)
  })

  it('counts the build and its workers, not unrelated node processes', () => {
    expect(isNextProcess('node /vercel/path0/node_modules/.bin/../next/dist/bin/next build')).toBe(true)
    expect(isNextProcess('node /vercel/path0/node_modules/next/dist/compiled/jest-worker/processChild.js')).toBe(true)
    expect(isNextProcess('node scripts/check-build-budget.mjs')).toBe(false)
  })

  it('fails a reading over budget and passes one under it', () => {
    const reading = (peakMb: number) => ({ pid: 1, peakMb, concurrentMb: peakMb, processes: 4 })
    expect(judge(reading(BUDGET_MB + 1), { onVercel: true }).ok).toBe(false)
    expect(judge(reading(BUDGET_MB), { onVercel: true }).ok).toBe(true)
  })

  it('fails on Vercel when the sampler never reported, and only skips locally', () => {
    expect(judge(null, { onVercel: true }).ok).toBe(false)
    expect(judge(null, { onVercel: false }).ok).toBe(true)
  })
})
