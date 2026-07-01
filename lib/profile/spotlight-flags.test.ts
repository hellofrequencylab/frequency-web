import { describe, it, expect } from 'vitest'
import {
  readSpotlightEnabled,
  readSpotlightPublished,
  withSpotlightEnabled,
  withSpotlightPublished,
  readSpotlightThemes,
  withSpotlightThemes,
  clampSpotlightThemeName,
  MAX_SPOTLIGHT_THEMES,
  SPOTLIGHT_THEME_NAME_MAX,
  readSpotlightDraftRaw,
  withSpotlightDraft,
  clearSpotlightDraft,
  type SpotlightThemeSlot,
} from './spotlight-flags'

describe('spotlight-flags', () => {
  it('defaults to false for null / undefined / empty / missing key', () => {
    for (const m of [null, undefined, {}, { spotlight: {} }, { other: 1 }]) {
      expect(readSpotlightEnabled(m)).toBe(false)
      expect(readSpotlightPublished(m)).toBe(false)
    }
  })

  it('reads true only for an explicit boolean true (no coercion)', () => {
    expect(readSpotlightEnabled({ spotlight: { enabled: true } })).toBe(true)
    expect(readSpotlightEnabled({ spotlight: { enabled: 1 } })).toBe(false)
    expect(readSpotlightEnabled({ spotlight: { enabled: 'true' } })).toBe(false)
    expect(readSpotlightPublished({ spotlight: { published: true } })).toBe(true)
  })

  it('round-trips write → read', () => {
    expect(readSpotlightEnabled(withSpotlightEnabled({}, true))).toBe(true)
    expect(readSpotlightEnabled(withSpotlightEnabled({}, false))).toBe(false)
    expect(readSpotlightPublished(withSpotlightPublished({}, true))).toBe(true)
  })

  it('preserves sibling meta keys when merging (no clobber)', () => {
    const meta = { daily_checkin_date: '2026-06-27', practiceStreak: 7, spotlight: { published: true } }
    const next = withSpotlightEnabled(meta, true)
    expect(next.daily_checkin_date).toBe('2026-06-27')
    expect(next.practiceStreak).toBe(7)
    expect(readSpotlightEnabled(next)).toBe(true)
    // enabling must not touch the published flag
    expect(readSpotlightPublished(next)).toBe(true)
  })

  it('enabled and published are independent', () => {
    const m1 = withSpotlightEnabled({}, true)
    expect(readSpotlightEnabled(m1)).toBe(true)
    expect(readSpotlightPublished(m1)).toBe(false)
  })
})

const OWNER = '00000000-0000-4000-8000-000000000000'

// A minimal, already-well-formed slot the writer/reader will keep verbatim (theme empty-default,
// background with no asset path so no owner pinning is exercised on the happy path).
function slot(id: string, name: string): SpotlightThemeSlot {
  return {
    id,
    name,
    theme: {
      accent: '#ff6b6b', surface: null, text: null,
      bg: { kind: 'none' }, font: { heading: 'sans', body: 'sans' },
      card: { radius: 'lg', shadow: 'soft', style: 'solid' },
      header: { show: true, height: 160, focusY: 50 },
    },
    background: { assetPath: null, dim: 0, focusX: 50, focusY: 50, zoom: 100 },
  }
}

describe('spotlight theme slots (max 3, validate on read + write)', () => {
  it('reads [] for a missing / non-array themes node', () => {
    for (const m of [null, undefined, {}, { spotlight: {} }, { spotlight: { themes: 'nope' } }, { spotlight: { themes: {} } }]) {
      expect(readSpotlightThemes(m, OWNER)).toEqual([])
    }
  })

  it('round-trips write → read, preserving order + names', () => {
    const meta = withSpotlightThemes({}, [slot('a', 'Sunset'), slot('b', 'Forest')], OWNER)
    const read = readSpotlightThemes(meta, OWNER)
    expect(read.map((s) => s.id)).toEqual(['a', 'b'])
    expect(read.map((s) => s.name)).toEqual(['Sunset', 'Forest'])
  })

  it('clamps the array to MAX_SPOTLIGHT_THEMES on write', () => {
    const many = Array.from({ length: MAX_SPOTLIGHT_THEMES + 2 }, (_, i) => slot(`id-${i}`, `Theme ${i}`))
    const meta = withSpotlightThemes({}, many, OWNER)
    expect(readSpotlightThemes(meta, OWNER)).toHaveLength(MAX_SPOTLIGHT_THEMES)
  })

  it('caps the array on read too (never trusts an over-long stored blob)', () => {
    const many = Array.from({ length: MAX_SPOTLIGHT_THEMES + 3 }, (_, i) => slot(`id-${i}`, `T${i}`))
    // Bypass the writer to simulate a tampered blob with too many slots.
    const tampered = { spotlight: { themes: many } }
    expect(readSpotlightThemes(tampered, OWNER)).toHaveLength(MAX_SPOTLIGHT_THEMES)
  })

  it('drops slots with no usable id (validate on read)', () => {
    const tampered = { spotlight: { themes: [slot('', 'no-id'), { name: 'missing' }, slot('ok', 'Keep')] } }
    const read = readSpotlightThemes(tampered, OWNER)
    expect(read.map((s) => s.id)).toEqual(['ok'])
  })

  it('validates each slot theme on read (a bad accent hex is dropped to null)', () => {
    const bad = { ...slot('x', 'Bad'), theme: { ...slot('x', 'Bad').theme, accent: 'not-a-hex' } }
    const tampered = { spotlight: { themes: [bad] } }
    expect(readSpotlightThemes(tampered, OWNER)[0].theme.accent).toBeNull()
  })

  it('validates a slot background on read: a FOREIGN asset path is pinned out to null', () => {
    const foreign = { ...slot('x', 'X'), background: { assetPath: 'someoneelse/spotlight/pic.png', dim: 0, focusX: 50, focusY: 50, zoom: 100 } }
    const tampered = { spotlight: { themes: [foreign] } }
    expect(readSpotlightThemes(tampered, OWNER)[0].background.assetPath).toBeNull()
  })

  it('clamps slot names on read + write (length + default)', () => {
    const long = 'x'.repeat(SPOTLIGHT_THEME_NAME_MAX + 20)
    expect(clampSpotlightThemeName(long).length).toBe(SPOTLIGHT_THEME_NAME_MAX)
    expect(clampSpotlightThemeName('   ')).toBe('My theme')
    expect(clampSpotlightThemeName(42)).toBe('My theme')
    const meta = withSpotlightThemes({}, [slot('a', long)], OWNER)
    expect(readSpotlightThemes(meta, OWNER)[0].name.length).toBe(SPOTLIGHT_THEME_NAME_MAX)
  })

  it('preserves sibling meta + spotlight keys when writing themes', () => {
    const meta = { practiceStreak: 7, spotlight: { enabled: true, published: true } }
    const next = withSpotlightThemes(meta, [slot('a', 'A')], OWNER)
    expect(next.practiceStreak).toBe(7)
    expect(readSpotlightEnabled(next)).toBe(true)
    expect(readSpotlightPublished(next)).toBe(true)
    expect(readSpotlightThemes(next, OWNER)).toHaveLength(1)
  })
})

describe('spotlight draft node (working copy, never the live nodes)', () => {
  it('reads undefined when no draft is present', () => {
    for (const m of [null, undefined, {}, { spotlight: {} }, { spotlight: { draft: 'x' } }]) {
      expect(readSpotlightDraftRaw(m)).toBeUndefined()
    }
  })

  it('round-trips a draft write → read without touching live nodes', () => {
    const meta = { spotlight: { published: true, layout: { version: 1, blocks: [] } } }
    const draft = { layout: { version: 1, blocks: [] }, theme: {}, background: {} }
    const next = withSpotlightDraft(meta, draft)
    // Live published flag + layout untouched.
    expect(readSpotlightPublished(next)).toBe(true)
    expect((next.spotlight as { layout?: unknown }).layout).toEqual({ version: 1, blocks: [] })
    // Draft present.
    expect(readSpotlightDraftRaw(next)).toEqual(draft)
  })

  it('clearSpotlightDraft removes only the draft, preserving everything else', () => {
    const meta = withSpotlightDraft({ spotlight: { published: true } }, { layout: {}, theme: {}, background: {} })
    const cleared = clearSpotlightDraft(meta)
    expect(readSpotlightDraftRaw(cleared)).toBeUndefined()
    expect(readSpotlightPublished(cleared)).toBe(true)
  })
})
