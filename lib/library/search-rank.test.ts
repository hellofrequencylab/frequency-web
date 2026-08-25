import { describe, it, expect } from 'vitest'
import {
  mergeCandidates,
  rankLibraryMatches,
  relevanceScore,
  searchTerms,
  trigramSimilarity,
  trigrams,
  type RankableAsset,
} from './search-rank'

// Loom search ranking (PROG-D1's search half). The properties here are the ones that make the
// difference between "the row exists" and "the search is good": a typo still finds the asset, a
// stemmed full-text hit counts for something, and the order is TOTAL so paging cannot repeat or
// drop a row.

const asset = (over: Partial<RankableAsset> & { id: string; title: string }): RankableAsset => ({
  category: null,
  description: null,
  tags: [],
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
})

describe('trigrams + similarity behave like pg_trgm', () => {
  it('pads each word, so even a two-letter word produces trigrams', () => {
    expect([...trigrams('go')]).toEqual(['  g', ' go', 'go '])
  })

  it('scores an exact string at 1 and unrelated strings near 0', () => {
    expect(trigramSimilarity('lavender', 'lavender')).toBe(1)
    expect(trigramSimilarity('lavender', 'bulldozer')).toBeLessThan(0.2)
  })

  it('SURVIVES A TYPO — the reason the trigram arm exists at all', () => {
    // No substring of "lavendar" matches "lavender", so an ilike alone could rank this at nothing.
    expect(trigramSimilarity('lavendar', 'lavender')).toBeGreaterThan(0.4)
  })

  it('is symmetric and empty-safe', () => {
    expect(trigramSimilarity('a b', 'b a')).toBe(trigramSimilarity('b a', 'a b'))
    expect(trigramSimilarity('', 'anything')).toBe(0)
  })
})

describe('searchTerms', () => {
  it('splits on anything that is not alphanumeric and drops the empties', () => {
    expect(searchTerms('  Sunset over-the Bay!! ')).toEqual(['sunset', 'over', 'the', 'bay'])
  })
})

describe('relevanceScore', () => {
  const q = 'sunset'

  it('ranks exact title > prefix > substring', () => {
    const exact = relevanceScore(asset({ id: '1', title: 'Sunset' }), q, false)
    const prefix = relevanceScore(asset({ id: '2', title: 'Sunset over the bay' }), q, false)
    const inside = relevanceScore(asset({ id: '3', title: 'A photo of the sunset, taken late' }), q, false)
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(inside)
  })

  it('counts a curated tag above an incidental word in a description', () => {
    const tagged = relevanceScore(asset({ id: '1', title: 'Beach', tags: ['sunset'] }), q, false)
    const described = relevanceScore(asset({ id: '2', title: 'Beach', description: 'shot at sunset' }), q, false)
    expect(tagged).toBeGreaterThan(described)
  })

  it('credits the FULL-TEXT hit, which is the one signal it cannot derive itself', () => {
    // Postgres matched this on STEMS ("running" → "run"); nothing in this file can see that.
    const withFts = relevanceScore(asset({ id: '1', title: 'Morning runs' }), 'running', true)
    const without = relevanceScore(asset({ id: '1', title: 'Morning runs' }), 'running', false)
    expect(withFts).toBeGreaterThan(without)
  })

  it('scores an unrelated row at or near nothing', () => {
    expect(relevanceScore(asset({ id: '1', title: 'Bulldozer schematic' }), q, false)).toBeLessThan(5)
  })

  it('is 0 for an empty query', () => {
    expect(relevanceScore(asset({ id: '1', title: 'Sunset' }), '   ', true)).toBe(0)
  })
})

describe('rankLibraryMatches', () => {
  it('puts the best match first even when the database returned it last', () => {
    const rows = [
      asset({ id: 'c', title: 'Unrelated bulldozer' }),
      asset({ id: 'b', title: 'A sunset, later' }),
      asset({ id: 'a', title: 'Sunset' }),
    ]
    expect(rankLibraryMatches(rows, 'sunset', new Set()).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('finds a MISSPELLED query, which no substring filter would have ranked', () => {
    const rows = [
      asset({ id: 'other', title: 'Bulldozer schematic' }),
      asset({ id: 'want', title: 'Lavender field' }),
    ]
    expect(rankLibraryMatches(rows, 'lavendar', new Set()).map((r) => r.id)).toEqual(['want', 'other'])
  })

  it('lets a full-text-only hit outrank a row that matched on nothing else', () => {
    const rows = [
      asset({ id: 'plain', title: 'Something else entirely' }),
      asset({ id: 'stemmed', title: 'Morning runs' }),
    ]
    expect(rankLibraryMatches(rows, 'running', new Set(['stemmed'])).map((r) => r.id)).toEqual(['stemmed', 'plain'])
  })

  it('BREAKS TIES TOTALLY — newest first, then id', () => {
    // Two identically-scoring rows must have ONE order, not a stable-sort accident, because paging
    // re-ranks a differently-ordered candidate list on every request. A partial order here shows up
    // as a row that appears on both page 1 and page 2, or on neither.
    const rows = [
      asset({ id: 'zz', title: 'Sunset', createdAt: '2026-01-01T00:00:00Z' }),
      asset({ id: 'aa', title: 'Sunset', createdAt: '2026-01-01T00:00:00Z' }),
      asset({ id: 'mm', title: 'Sunset', createdAt: '2026-06-01T00:00:00Z' }),
    ]
    const forward = rankLibraryMatches(rows, 'sunset', new Set()).map((r) => r.id)
    const reversed = rankLibraryMatches([...rows].reverse(), 'sunset', new Set()).map((r) => r.id)
    expect(forward).toEqual(['mm', 'aa', 'zz'])
    expect(reversed).toEqual(forward)
  })

  it('does not drop rows', () => {
    const rows = Array.from({ length: 12 }, (_, i) => asset({ id: `id-${i}`, title: `Item ${i}` }))
    expect(rankLibraryMatches(rows, 'item', new Set())).toHaveLength(12)
  })
})

describe('mergeCandidates', () => {
  it('unions the two retrieval arms, first occurrence winning', () => {
    const fts = [{ id: 'a' }, { id: 'b' }]
    const trgm = [{ id: 'b' }, { id: 'c' }]
    expect(mergeCandidates(fts, trgm).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('is empty-safe on either side', () => {
    expect(mergeCandidates([], [{ id: 'x' }]).map((r) => r.id)).toEqual(['x'])
    expect(mergeCandidates([{ id: 'x' }], [])).toHaveLength(1)
    expect(mergeCandidates([], [])).toEqual([])
  })
})
