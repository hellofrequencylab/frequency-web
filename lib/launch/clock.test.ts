import { describe, expect, it } from 'vitest'
import { applyBeat, BEAT_EVERY_MS, clockView } from './clock'

const T = new Date('2026-10-29T12:00:00Z')
const ago = (ms: number) => new Date(T.getTime() - ms).toISOString()

describe('applyBeat', () => {
  it('adds the time since the last beat', () => {
    expect(applyBeat({ activeMs: 1000, lastBeatAt: ago(BEAT_EVERY_MS) }, 'beat', T).activeMs).toBe(16_000)
  })
  it('never adds more than thirty seconds, so a closed tab cannot run the clock', () => {
    expect(applyBeat({ activeMs: 0, lastBeatAt: ago(60 * 60_000) }, 'beat', T).activeMs).toBe(30_000)
    expect(applyBeat({ activeMs: 0, lastBeatAt: ago(60 * 60_000) }, 'stop', T).activeMs).toBe(30_000)
  })
  it('start adds nothing and begins counting from now', () => {
    expect(applyBeat({ activeMs: 5000, lastBeatAt: ago(600_000) }, 'start', T)).toEqual({ activeMs: 5000, lastBeatAt: T.toISOString() })
  })
  it('stop clears the last beat, so a later beat adds nothing until a start', () => {
    const stopped = applyBeat({ activeMs: 0, lastBeatAt: ago(10_000) }, 'stop', T)
    expect(stopped).toEqual({ activeMs: 10_000, lastBeatAt: null })
    expect(applyBeat(stopped, 'beat', new Date(T.getTime() + 600_000)).activeMs).toBe(10_000)
  })
  it('adds nothing for a missing, unreadable, or future last beat', () => {
    expect(applyBeat({ activeMs: 7, lastBeatAt: null }, 'beat', T).activeMs).toBe(7)
    expect(applyBeat({ activeMs: 7, lastBeatAt: 'nope' }, 'beat', T).activeMs).toBe(7)
    expect(applyBeat({ activeMs: 7, lastBeatAt: ago(-5000) }, 'beat', T).activeMs).toBe(7)
  })
})

describe('clockView', () => {
  const v = (activeMs: number, done = 0, total = 10) => clockView({ activeMs, done, total, running: true })
  it('counts down from 12:00', () => {
    expect(v(0).label).toBe('12:00')
    expect(v(5 * 60_000).label).toBe('7:00')
    expect(v(0).pace).toBe('start')
  })
  it('turns to bonus time past twelve minutes, counting up, without ending', () => {
    expect(v(12 * 60_000 + 65_000)).toMatchObject({ bonus: true, label: '1:05', pace: 'bonus', used: 1 })
  })
  it('cheers a pace from the list done: ahead when level, on pace otherwise, never behind', () => {
    expect(v(6 * 60_000, 5).pace).toBe('ahead')
    expect(v(6 * 60_000, 1).pace).toBe('on')
    expect(v(6 * 60_000, 0, 0).pace).toBe('ahead')
  })
})
