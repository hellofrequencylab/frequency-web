import { describe, it, expect } from 'vitest'
import {
  PLAYBACK_RATES,
  clampRate,
  cycleRate,
  formatRate,
  formatTime,
  formatRemaining,
  describeResume,
  positionKey,
  activeChapterIndex,
} from './playback'

describe('cycleRate', () => {
  it('steps forward through the fixed set', () => {
    expect(cycleRate(1, 1)).toBe(1.25)
    expect(cycleRate(0.5, 1)).toBe(0.75)
    expect(cycleRate(2, 1)).toBe(2.5)
  })

  it('wraps from the top back to the bottom (and vice versa)', () => {
    expect(cycleRate(3, 1)).toBe(0.5)
    expect(cycleRate(0.5, -1)).toBe(3)
  })

  it('steps backward', () => {
    expect(cycleRate(1, -1)).toBe(0.75)
    expect(cycleRate(1.25, -1)).toBe(1)
  })

  it('snaps an off-list value onto the nearest step before cycling', () => {
    // 1.1 snaps to 1, then +1 -> 1.25
    expect(cycleRate(1.1, 1)).toBe(1.25)
  })
})

describe('clampRate', () => {
  it('passes through a valid rate', () => {
    for (const r of PLAYBACK_RATES) expect(clampRate(r)).toBe(r)
  })

  it('snaps to the nearest valid rate', () => {
    expect(clampRate(1.3)).toBe(1.25)
    expect(clampRate(2.4)).toBe(2.5)
    expect(clampRate(10)).toBe(3)
    expect(clampRate(0.1)).toBe(0.5)
  })

  it('falls back to 1x for junk (NaN / Infinity)', () => {
    expect(clampRate(NaN)).toBe(1)
    expect(clampRate(Infinity)).toBe(1)
  })
})

describe('formatTime', () => {
  it('formats sub-hour as m:ss', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(5)).toBe('0:05')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(600)).toBe('10:00')
  })

  it('formats past an hour as h:mm:ss', () => {
    expect(formatTime(3661)).toBe('1:01:01')
    expect(formatTime(3600)).toBe('1:00:00')
  })

  it('floors fractional seconds', () => {
    expect(formatTime(5.9)).toBe('0:05')
  })

  it('guards NaN, negative, and Infinity to 0:00', () => {
    expect(formatTime(NaN)).toBe('0:00')
    expect(formatTime(-10)).toBe('0:00')
    expect(formatTime(Infinity)).toBe('0:00')
  })
})

describe('formatRemaining', () => {
  it('renders a signed remainder', () => {
    expect(formatRemaining(10, 100)).toBe('-1:30')
    expect(formatRemaining(0, 65)).toBe('-1:05')
  })

  it('never goes positive and guards a NaN duration', () => {
    expect(formatRemaining(120, 100)).toBe('-0:00')
    expect(formatRemaining(10, NaN)).toBe('-0:00')
  })
})

describe('formatRate', () => {
  it('labels the speed', () => {
    expect(formatRate(1)).toBe('1x')
    expect(formatRate(0.75)).toBe('0.75x')
    expect(formatRate(2.5)).toBe('2.5x')
  })
})

describe('positionKey', () => {
  it('builds a stable, namespaced per-recording key', () => {
    expect(positionKey('abc')).toBe('airwaves:pos:abc')
    expect(positionKey('rec-123')).toBe('airwaves:pos:rec-123')
  })
})

describe('describeResume', () => {
  it('reads plainly with a clock label', () => {
    expect(describeResume(200)).toBe('Resume from 3:20')
  })
})

describe('activeChapterIndex', () => {
  const chapters = [
    { startSec: 0, title: 'Intro' },
    { startSec: 60, title: 'Middle' },
    { startSec: 120, title: 'End' },
  ]

  it('returns the last chapter at or before now', () => {
    expect(activeChapterIndex(chapters, 0)).toBe(0)
    expect(activeChapterIndex(chapters, 59)).toBe(0)
    expect(activeChapterIndex(chapters, 60)).toBe(1)
    expect(activeChapterIndex(chapters, 130)).toBe(2)
  })

  it('returns -1 with no chapters', () => {
    expect(activeChapterIndex(undefined, 10)).toBe(-1)
    expect(activeChapterIndex([], 10)).toBe(-1)
  })

  it('resolves against the ORIGINAL index even when input is unsorted', () => {
    const unsorted = [
      { startSec: 120, title: 'End' }, // original index 0
      { startSec: 0, title: 'Intro' }, // original index 1
      { startSec: 60, title: 'Middle' }, // original index 2
    ]
    expect(activeChapterIndex(unsorted, 130)).toBe(0)
    expect(activeChapterIndex(unsorted, 5)).toBe(1)
    expect(activeChapterIndex(unsorted, 70)).toBe(2)
  })
})
