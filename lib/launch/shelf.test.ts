import { describe, expect, it } from 'vitest'
import { acceptedFor, checkFact, groupBySlot, snippetIsQuoted, type ShelfFact } from './facts'
import { checkSource, expiryFor, isExpired, SOURCE_LIMITS } from './sources'

const fact = (over: Partial<ShelfFact>): ShelfFact => ({ id: 'f', slot: 'tagline', value: 'v', snippet: 's', origin: 'o', state: 'suggested', ...over })

describe('sources', () => {
  it('stores the kind, label and sizes', () => {
    expect(checkSource({ kind: 'flyer', label: ' Spring flyer ', sizeBytes: 1200, charCount: 800 })).toEqual({
      ok: true,
      source: { kind: 'flyer', label: 'Spring flyer', sizeBytes: 1200, charCount: 800 },
    })
  })
  it('refuses an unknown kind, an empty label and sizes over the table limits', () => {
    expect(checkSource({ kind: 'video', label: 'x' })).toEqual({ ok: false, reason: 'kind' })
    expect(checkSource({ kind: 'list', label: '   ' })).toEqual({ ok: false, reason: 'label' })
    expect(checkSource({ kind: 'list', label: 'x', sizeBytes: SOURCE_LIMITS.bytesMax + 1 })).toEqual({ ok: false, reason: 'size' })
    expect(checkSource({ kind: 'list', label: 'x', charCount: SOURCE_LIMITS.charsMax + 1 })).toEqual({ ok: false, reason: 'chars' })
  })
  it('keeps a cancelled launch thirty days', () => {
    const cancelled = new Date('2026-11-01T00:00:00Z')
    expect(expiryFor(cancelled).toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(isExpired(expiryFor(cancelled), new Date('2026-11-30T00:00:00Z'))).toBe(false)
    expect(isExpired(expiryFor(cancelled), new Date('2026-12-01T00:00:00Z'))).toBe(true)
    expect(isExpired(null, new Date())).toBe(false)
  })
})

describe('facts', () => {
  const ok = { slot: 'tagline', value: 'Yoga for tired shoulders', snippet: 'yoga for tired shoulders', origin: 'About page, second line' }
  it('accepts a fact with a snippet and an origin', () => {
    expect(checkFact(ok).ok).toBe(true)
  })
  it('refuses a fact without a snippet or an origin, or with an unknown slot', () => {
    expect(checkFact({ ...ok, snippet: '' })).toEqual({ ok: false, reason: 'snippet' })
    expect(checkFact({ ...ok, origin: ' ' })).toEqual({ ok: false, reason: 'origin' })
    expect(checkFact({ ...ok, slot: 'price' })).toEqual({ ok: false, reason: 'slot' })
  })
  it('refuses a snippet that is not the person’s own words', () => {
    const text = 'Welcome. We teach Yoga   for tired\nshoulders in Encinitas.'
    expect(snippetIsQuoted(text, 'yoga for tired shoulders')).toBe(true)
    expect(checkFact(ok, text).ok).toBe(true)
    expect(checkFact({ ...ok, snippet: 'calm movement for stiff necks' }, text)).toEqual({ ok: false, reason: 'not_quoted' })
  })
  it('groups by slot, leaves dismissed facts out, and seeds from the newest accepted one', () => {
    const facts = [fact({ id: '1', slot: 'story', state: 'accepted' }), fact({ id: '2', slot: 'story', state: 'accepted' }), fact({ id: '3', slot: 'hours', state: 'dismissed' }), fact({ id: '4', slot: 'name' })]
    expect(groupBySlot(facts).map((g) => g.slot)).toEqual(['name', 'story'])
    expect(acceptedFor(facts, 'story')?.id).toBe('2')
    expect(acceptedFor(facts, 'hours')).toBeNull()
  })
})
