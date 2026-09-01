import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  SEED_MOODS,
  DEFAULT_SEED_MOOD,
  isSeedMood,
  normalizeSeedMood,
  seedMoodSpec,
  moodToneDirective,
  moodToSpaceTheme,
  moodToAccent,
  moodImageStyle,
  moodLook,
  isAccentKey,
  DEFAULT_ACCENT,
} from './moods'
import { isSpaceThemeId } from '@/lib/theme/space-themes'

describe('seed moods', () => {
  it('has exactly the four owner-picked moods, each fully specified', () => {
    expect(SEED_MOODS.map((m) => m.key)).toEqual(['warm', 'bold', 'calm', 'playful'])
    for (const m of SEED_MOODS) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(m.toneWords.length).toBeGreaterThan(0)
      expect(['gentle', 'direct', 'confident']).toContain(m.cta)
      expect(['soft', 'vivid', 'minimal', 'high']).toContain(m.accent)
      // Voice canon: operator copy carries no em dashes.
      expect(m.description).not.toContain('—')
    }
  })

  it('isSeedMood only accepts known keys', () => {
    expect(isSeedMood('warm')).toBe(true)
    expect(isSeedMood('nope')).toBe(false)
    expect(isSeedMood(undefined)).toBe(false)
  })

  it('normalizeSeedMood is total and falls back to the default', () => {
    expect(normalizeSeedMood('bold')).toBe('bold')
    expect(normalizeSeedMood('garbage')).toBe(DEFAULT_SEED_MOOD)
    expect(normalizeSeedMood(null)).toBe(DEFAULT_SEED_MOOD)
  })

  it('seedMoodSpec never returns undefined', () => {
    expect(seedMoodSpec('calm').key).toBe('calm')
    expect(seedMoodSpec('garbage').key).toBe(DEFAULT_SEED_MOOD)
  })

  it('moodToneDirective names the mood + its tone words', () => {
    const d = moodToneDirective('playful')
    expect(d).toContain('Playful and vibrant')
    expect(d).toContain('vibrant')
  })

  it('moodToSpaceTheme maps every mood to a real page theme (task #21)', () => {
    expect(moodToSpaceTheme('warm')).toBe('editorial')
    expect(moodToSpaceTheme('bold')).toBe('bold')
    expect(moodToSpaceTheme('calm')).toBe('classic')
    expect(moodToSpaceTheme('playful')).toBe('playful')
    // Total + safe: garbage falls back to the default mood's theme, always a real theme id.
    expect(isSpaceThemeId(moodToSpaceTheme('garbage'))).toBe(true)
    expect(moodToSpaceTheme('garbage')).toBe(moodToSpaceTheme(DEFAULT_SEED_MOOD))
  })

  // ── The mood drives the LOOK, not just the words (ADR-993) ────────────────────────────────

  it('moodToAccent maps every mood to a real Studio accent, and leaves the house default free', () => {
    expect(moodToAccent('warm')).toBe('clay')
    expect(moodToAccent('bold')).toBe('indigo')
    expect(moodToAccent('calm')).toBe('teal')
    expect(moodToAccent('playful')).toBe('gold')
    for (const m of SEED_MOODS) {
      expect(isAccentKey(moodToAccent(m.key))).toBe(true)
      // 'jade' stays reserved: "no mood chosen" must not look identical to a chosen mood.
      expect(moodToAccent(m.key)).not.toBe(DEFAULT_ACCENT)
    }
    // Total + safe: garbage falls back to the default mood's accent, always a real key.
    expect(moodToAccent('garbage')).toBe(moodToAccent(DEFAULT_SEED_MOOD))
  })

  it('every mood has distinct image style words, plain and em-dash free', () => {
    const seen = new Set<string>()
    for (const m of SEED_MOODS) {
      const style = moodImageStyle(m.key)
      expect(style.length).toBeGreaterThan(10)
      expect(style).not.toContain('—')
      seen.add(style)
    }
    expect(seen.size).toBe(SEED_MOODS.length)
    expect(moodImageStyle('garbage')).toBe(moodImageStyle(DEFAULT_SEED_MOOD))
  })

  it('moodLook answers theme, accent, emphasis and image style in one call', () => {
    const look = moodLook('calm')
    expect(look.theme).toBe('classic')
    expect(look.accent).toBe('teal')
    expect(look.emphasis).toBe(seedMoodSpec('calm').accent)
    expect(look.imageStyle).toBe(moodImageStyle('calm'))
    // Total: an unknown value still returns a complete, real look.
    const fallback = moodLook(null)
    expect(isSpaceThemeId(fallback.theme)).toBe(true)
    expect(isAccentKey(fallback.accent)).toBe(true)
  })
})

// ── THE THEME WRITE IS GUARDED, AND THE GUARD HAS TO BE ABLE TO FIRE ─────────────────────────────
//
// `writeProfileDataAndLayout` wraps its `preferences.theme` write in `if (mood)` and documents it as
// "only when a mood is given, so a re-run with no mood never disturbs an operator's chosen style".
// That protection was inoperative from the day it was written: the sole caller passed
// `normalizeSeedMood(row.inputs.mood)`, and `normalizeSeedMood` is TOTAL — it answers 'warm' for
// undefined — so `mood` was unconditionally truthy and the guard could never be false. Every apply
// and re-apply therefore wrote a theme, and an intake carrying no mood wrote `editorial` (warm's
// theme, 2px corners) over whatever the operator had chosen. `adoptSpaceMasterProfile` builds its
// inputs with no mood at all, so re-applying an adopted hand-made Space was exactly that case.
//
// These are source assertions because the guard lives in a function that needs a live Supabase
// client to run, and the defect was never in the guard — it was in what the caller handed it.
describe('the seed mood reaches the theme write UNNORMALIZED, so "no mood" stays no mood', () => {
  const SRC = readFileSync(new URL('./materialize.ts', import.meta.url), 'utf8')

  it('passes the raw value through a type guard, never through normalizeSeedMood', () => {
    expect(SRC).toContain('mood: isSeedMood(row.inputs.mood) ? row.inputs.mood : undefined,')
    expect(SRC).not.toContain('mood: normalizeSeedMood(')
  })

  it('still guards the write, so an absent mood cannot overwrite a chosen theme', () => {
    expect(SRC).toMatch(/if \(mood\) \{[\s\S]{0,200}moodToSpaceTheme\(mood\)/)
  })

  // The property the guard depends on: absent must be falsy at the boundary, and normalizing must
  // NOT be. If isSeedMood ever starts defaulting, the guard silently dies again.
  it('isSeedMood rejects absent/unknown while normalizeSeedMood substitutes a default', () => {
    expect(isSeedMood(undefined)).toBe(false)
    expect(isSeedMood('nonsense')).toBe(false)
    expect(isSeedMood('playful')).toBe(true)
    expect(normalizeSeedMood(undefined)).toBe('warm')
  })

  // Normalization still has to happen SOMEWHERE, or a junk mood would reach the CSS as a theme id.
  it('moodToSpaceTheme is still total, so the mapping itself never returns undefined', () => {
    expect(moodToSpaceTheme(undefined)).toBe('editorial')
    expect(moodToSpaceTheme('nonsense')).toBe('editorial')
    expect(moodToSpaceTheme('playful')).toBe('playful')
  })
})
