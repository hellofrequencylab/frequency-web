import { describe, it, expect } from 'vitest'
import { clampWarmupSec, WARMUP_PRESETS, DEFAULT_PREFS } from '@/lib/on-air'

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
