import { describe, expect, it } from 'vitest'
import { BUDGET_MB, isNextProcess, judge, runningPeakReporter } from './check-build-memory.mjs'

describe('check-build-memory (HYG-171)', () => {
  it('keeps a reserve under the 8 GB Standard build machine', () => {
    expect(BUDGET_MB).toBeLessThanOrEqual(7168)
  })

  it('counts the build and its workers, not unrelated node processes', () => {
    expect(isNextProcess('node /vercel/path0/node_modules/.bin/../next/dist/bin/next build')).toBe(true)
    expect(isNextProcess('node /vercel/path0/node_modules/next/dist/compiled/jest-worker/processChild.js')).toBe(true)
    expect(isNextProcess('node scripts/check-build-budget.mjs')).toBe(false)
    expect(isNextProcess('/bin/sh -c node node_modules/next/dist/bin/next build')).toBe(false)
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

describe('running build memory log (HYG-221)', () => {
  it('logs the first measured reading and then every 30 seconds while sampling', () => {
    const lines: string[] = []
    const report = runningPeakReporter((line: string) => lines.push(line))
    const reading = { peakMb: 2770, concurrentMb: 2320, processes: 4 }
    report({ ...reading, processes: 0 }, 0)
    report(reading, 250)
    report({ ...reading, peakMb: 3200 }, 30_249)
    report({ ...reading, peakMb: 3200 }, 30_250)
    expect(lines).toEqual([
      'check-build-memory: running peak after 0s: 2770 MB summed high-water across 4 next process(es), 2320 MB at once.',
      'check-build-memory: running peak after 30s: 3200 MB summed high-water across 4 next process(es), 2320 MB at once.',
    ])
  })
})
