import { describe, expect, it } from 'vitest'
import { FEATURES, OPEN_FEATURES, feature, finishHref, isFeatureId, nextFeatures } from './catalog'
import { clockView } from './clock'
import { cleanDraft, cleanLink, missingField, parseDraft } from './draft'

describe('feature catalog', () => {
  it('names four builders, each with its own page and a short clock', () => {
    expect(FEATURES.map((f) => f.id)).toEqual(['spotlight', 'space', 'website', 'email'])
    for (const f of FEATURES) {
      expect(f.href.startsWith('/')).toBe(true)
      expect(f.minutes).toBeGreaterThan(0)
      expect(f.minutes).toBeLessThan(12)
    }
    expect(feature('spotlight').href).toBe('/free-spotlight')
    expect(isFeatureId('space')).toBe(true)
    expect(isFeatureId('nope')).toBe(false)
    expect(finishHref('email')).toBe('/finish/email')
  })

  it('offers only open builders next, never the one just built, starting after it', () => {
    const open = OPEN_FEATURES.map((f) => f.id)
    for (const f of FEATURES) {
      const ids = nextFeatures(f.id).map((x) => x.id)
      expect(ids).not.toContain(f.id)
      for (const id of ids) expect(open).toContain(id)
    }
    expect(nextFeatures('spotlight', ['space', 'website', 'email'])).toEqual([])
  })
})

describe('feature drafts', () => {
  it('keeps only the feature fields, trimmed and cut', () => {
    const d = cleanDraft('spotlight', { name: '  Sam  ', line: 'x'.repeat(400), link: 'instagram.com/sam', extra: 'no' })
    expect(d).toEqual({ name: 'Sam', line: 'x'.repeat(300), link: 'https://instagram.com/sam' })
    expect(cleanDraft('spotlight', 'junk')).toEqual({ name: '', line: '', link: '' })
  })

  it('drops a link that is not a web address', () => {
    expect(cleanLink('javascript:alert(1)')).toBe('')
    expect(cleanLink('not a link')).toBe('')
    expect(cleanLink('https://example.com/a')).toBe('https://example.com/a')
  })

  it('reads a complete draft and refuses an incomplete or broken one', () => {
    expect(parseDraft('spotlight', JSON.stringify({ name: 'Sam', line: 'Teacher' }))).toMatchObject({ name: 'Sam', line: 'Teacher', link: '' })
    expect(parseDraft('spotlight', JSON.stringify({ name: 'Sam' }))).toBeNull()
    expect(parseDraft('spotlight', '{')).toBeNull()
    expect(missingField('spotlight', { name: '', line: 'x', link: '' })).toBe('name')
  })
})

describe('feature clock', () => {
  const budget = 3 * 60_000
  it('waits for the first keystroke', () => {
    expect(clockView({ startedAt: null, endedAt: null }, 0, budget).state).toBe('ready')
  })
  it('counts down, then counts bonus time without stopping anyone', () => {
    expect(clockView({ startedAt: 0, endedAt: null }, 60_000, budget)).toMatchObject({ state: 'running', label: '2:00' })
    expect(clockView({ startedAt: 0, endedAt: null }, 200_000, budget)).toMatchObject({ state: 'bonus', label: '+0:20' })
  })
  it('says when the clock was beaten', () => {
    expect(clockView({ startedAt: 0, endedAt: 100_000 }, 500_000, budget)).toMatchObject({ state: 'done', caption: 'Beat the clock', elapsedMs: 100_000 })
    expect(clockView({ startedAt: 0, endedAt: 400_000 }, 500_000, budget).caption).toBe('Done')
  })
})
