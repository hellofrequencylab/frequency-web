import { describe, expect, it } from 'vitest'
import {
  BUDGET_MB,
  CONTAINER_HARD_STOP_MB,
  CONTAINER_LIMIT_MB,
  CONTAINER_TARGET_MB,
  containerPeak,
  isNextProcess,
  judge,
  judgeContainer,
  runningPeakReporter,
} from './check-build-memory.mjs'

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

describe('container peak gate (HYG-241)', () => {
  const vercel = { onVercel: true }

  it('sets the stop line from the killed reading, under the machine and over the target', () => {
    expect(CONTAINER_HARD_STOP_MB).toBe(7937)
    expect(CONTAINER_HARD_STOP_MB).toBeLessThan(CONTAINER_LIMIT_MB)
    expect(CONTAINER_TARGET_MB).toBeLessThan(CONTAINER_HARD_STOP_MB)
  })

  it('passes the three green production builds read on 2026-11-16 and prints the trend', () => {
    for (const peakMb of [7768, 7784, 7859]) expect(judgeContainer({ peakMb }, vercel)).toMatchObject({ ok: true, warn: false })
    expect(judgeContainer({ peakMb: 7859 }, vercel).message).toBe(
      'container peak 7859 MB of 8192 MB (333 MB of margin), 691 MB over the 7168 MB target; warns above 7937 MB',
    )
    expect(judgeContainer({ peakMb: 6500 }, vercel).message).toContain('668 MB under the 7168 MB target')
  })

  it('warns only above the last killed reading, and never fails the build', () => {
    expect(judgeContainer({ peakMb: CONTAINER_HARD_STOP_MB }, vercel)).toMatchObject({ ok: true, warn: false })
    const over = judgeContainer({ peakMb: CONTAINER_HARD_STOP_MB + 1 }, vercel)
    expect(over).toMatchObject({ ok: true, warn: true })
    expect(over.message).toContain('container peak 7938 MB')
  })

  it('warns while the next processes read about 100 MB, the case the old gate could not see', () => {
    const reading = { pid: 1, peakMb: 100, concurrentMb: 100, processes: 4, containerPeakMb: 8000 }
    expect(judge(reading, vercel).ok).toBe(true)
    expect(judgeContainer(containerPeak(reading, null), vercel)).toMatchObject({ ok: true, warn: true })
  })

  it('warns on Vercel when the container was not measured, and stays quiet locally', () => {
    expect(judgeContainer(null, vercel)).toMatchObject({ ok: true, warn: true })
    expect(judgeContainer(null, { onVercel: false })).toMatchObject({ ok: true, warn: false })
    expect(judgeContainer({ peakMb: 9000 }, { onVercel: false })).toMatchObject({ ok: true, warn: false })
  })

  it('takes the larger of the sampled peak and the fresh postbuild read', () => {
    expect(containerPeak({ containerPeakMb: 7700 }, { peakMb: 7800 })).toEqual({ peakMb: 7800 })
    expect(containerPeak({ containerPeakMb: 7800 }, { peakMb: 7700 })).toEqual({ peakMb: 7800 })
    expect(containerPeak({ containerPeakMb: 7800 }, null)).toEqual({ peakMb: 7800 })
    expect(containerPeak({}, { peakMb: 7700 })).toEqual({ peakMb: 7700 })
    expect(containerPeak({}, null)).toBeNull()
  })
})
