import { describe, it, expect } from 'vitest'
import {
  clampWarmupSec, WARMUP_PRESETS, DEFAULT_PREFS,
  clampAuthoredWarmupSec, cleanWarmupMessage, WARMUP_MESSAGE_MAX, WARMUP_SEC_MAX, AUTHORED_WARMUP_PRESETS,
  resolveWarmupSec,
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

// The engines resolve the actual pre-roll length through resolveWarmupSec. Both the sit and Get
// Moving call it so a run's warm-up is decided one way, and the top-up leg ("finish the rest")
// passes an explicit 0 to skip the SECOND warm-up (the fix for the reported double-warm-up).
describe('resolveWarmupSec — the engine pre-roll length', () => {
  it('falls back to the member pre-roll when nothing is authored', () => {
    expect(resolveWarmupSec(null, 5)).toBe(5)
    expect(resolveWarmupSec(undefined, 3)).toBe(3)
    expect(resolveWarmupSec(0, 10)).toBe(10) // authored 0 = "use the member default"
  })
  it('prefers a positive authored warm-up over the member pref', () => {
    expect(resolveWarmupSec(15, 5)).toBe(15)
    expect(resolveWarmupSec(30, 3)).toBe(30)
  })
  it('lets an explicit override win over everything — 0 skips the warm-up entirely', () => {
    expect(resolveWarmupSec(30, 5, 0)).toBe(0) // top-up leg: authored 30s ignored, resume straight in
    expect(resolveWarmupSec(0, 5, 0)).toBe(0)
    expect(resolveWarmupSec(15, 5, 8)).toBe(8) // a feature funnel could arm its own length
  })
  it('never returns a negative or fractional length', () => {
    expect(resolveWarmupSec(null, -5)).toBe(0)
    expect(resolveWarmupSec(null, 5, -3)).toBe(0)
    expect(resolveWarmupSec(null, 5, 8.6)).toBe(9)
    expect(resolveWarmupSec(null, 5, NaN)).toBe(5) // non-finite override is ignored, fall through
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
