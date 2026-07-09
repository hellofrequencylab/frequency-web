import { describe, it, expect } from 'vitest'
import {
  clampWarmupSec, WARMUP_PRESETS, DEFAULT_PREFS,
  clampAuthoredWarmupSec, cleanWarmupMessage, WARMUP_MESSAGE_MAX, WARMUP_SEC_MAX, AUTHORED_WARMUP_PRESETS,
} from '@/lib/on-air'

// The selectable warm-up countdown (item #6): 3 / 5 / 10 seconds, defaulting to 5. This is the
// canonical clamp the prefs round-trip uses (the completeSession merge + session-data read apply
// the SAME 3|5|10 rule), so a stored / input value always lands on a valid preset.
describe('clampWarmupSec — the warm-up prefs round-trip', () => {
  it('offers exactly the three presets', () => {
    expect(WARMUP_PRESETS).toEqual([3, 5, 10])
  })

  it('defaults to 5 (the original pre-roll)', () => {
    expect(DEFAULT_PREFS.warmupSec).toBe(5)
    expect(clampWarmupSec(undefined)).toBe(5)
  })

  it('round-trips each valid preset unchanged', () => {
    for (const w of WARMUP_PRESETS) expect(clampWarmupSec(w)).toBe(w)
  })

  it('clamps any off-preset value back to 5', () => {
    expect(clampWarmupSec(0)).toBe(5)
    expect(clampWarmupSec(4)).toBe(5)
    expect(clampWarmupSec(7)).toBe(5)
    expect(clampWarmupSec(11)).toBe(5)
    expect(clampWarmupSec(-3)).toBe(5)
    expect(clampWarmupSec(NaN)).toBe(5)
  })
})

// The CREATOR-authored warm-up (ADR-592): a message + length the author presets, distinct from
// the member's 3/5/10 pre-roll. Null length = fall back to the member pref; 0 is the same choice.
describe('clampAuthoredWarmupSec — the author warm-up length', () => {
  it('null / undefined / NaN → null (use the member pre-roll)', () => {
    expect(clampAuthoredWarmupSec(null)).toBeNull()
    expect(clampAuthoredWarmupSec(undefined)).toBeNull()
    expect(clampAuthoredWarmupSec(NaN)).toBeNull()
  })
  it('keeps 0 (an explicit "member default" choice) and each preset', () => {
    for (const s of AUTHORED_WARMUP_PRESETS) expect(clampAuthoredWarmupSec(s)).toBe(s)
  })
  it('clamps into 0..max and rounds', () => {
    expect(clampAuthoredWarmupSec(-5)).toBe(0)
    expect(clampAuthoredWarmupSec(9999)).toBe(WARMUP_SEC_MAX)
    expect(clampAuthoredWarmupSec(12.6)).toBe(13)
  })
})

describe('cleanWarmupMessage — the author warm-up message', () => {
  it('trims, and an empty / whitespace message becomes null (a silent pre-roll)', () => {
    expect(cleanWarmupMessage(null)).toBeNull()
    expect(cleanWarmupMessage('   ')).toBeNull()
    expect(cleanWarmupMessage('  Breathe.  ')).toBe('Breathe.')
  })
  it('caps to WARMUP_MESSAGE_MAX', () => {
    const long = 'x'.repeat(WARMUP_MESSAGE_MAX + 50)
    expect(cleanWarmupMessage(long)).toHaveLength(WARMUP_MESSAGE_MAX)
  })
})
