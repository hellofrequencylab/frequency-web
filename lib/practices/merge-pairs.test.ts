import { describe, it, expect } from 'vitest'
import { buildMergePairs, similarityPercent, type MergeCandidateInput } from './merge-pairs'

// The merge-pair shaping (Phase 2 item 2.2) is pure, so its boundaries are unit-tested without a
// database: it turns the review queue's near-dup signal into ranked, de-duped merge pairs the
// curator acts on. It never gates anything (a merge is always operator-confirmed); these tests
// lock the shape the panel renders and the direction it defaults to.

function row(over: Partial<MergeCandidateInput> & { id: string }): MergeCandidateInput {
  return { title: `Practice ${over.id}`, possibleDuplicateOf: null, ...over }
}

describe('buildMergePairs: basics', () => {
  it('is empty for an empty queue', () => {
    expect(buildMergePairs([])).toEqual([])
  })

  it('drops rows with no flagged duplicate', () => {
    const pairs = buildMergePairs([row({ id: 'a' }), row({ id: 'b' })])
    expect(pairs).toEqual([])
  })

  it('shapes a flagged row into a pair: queue row folds INTO the existing match', () => {
    const pairs = buildMergePairs([
      row({
        id: 'pending-1',
        title: 'Box breathing (copy)',
        possibleDuplicateOf: { id: 'live-1', title: 'Box breathing', similarity: 0.94 },
      }),
    ])
    expect(pairs).toHaveLength(1)
    // The DEFAULT direction keeps the existing public practice (live-1) and folds the new copy in.
    expect(pairs[0].duplicate).toEqual({ id: 'pending-1', title: 'Box breathing (copy)' })
    expect(pairs[0].canonical).toEqual({ id: 'live-1', title: 'Box breathing' })
    expect(pairs[0].similarity).toBe(0.94)
  })
})

describe('buildMergePairs: de-dupe + self-pairs', () => {
  it('never pairs a row with itself', () => {
    const pairs = buildMergePairs([
      row({ id: 'a', possibleDuplicateOf: { id: 'a', title: 'A', similarity: 0.99 } }),
    ])
    expect(pairs).toEqual([])
  })

  it('lists an unordered pair once even when both rows flag each other', () => {
    const pairs = buildMergePairs([
      row({ id: 'a', possibleDuplicateOf: { id: 'b', title: 'B', similarity: 0.95 } }),
      row({ id: 'b', possibleDuplicateOf: { id: 'a', title: 'A', similarity: 0.95 } }),
    ])
    expect(pairs).toHaveLength(1)
  })
})

describe('buildMergePairs: ordering', () => {
  it('orders the most-alike pair first', () => {
    const pairs = buildMergePairs([
      row({ id: 'low', possibleDuplicateOf: { id: 'x', title: 'X', similarity: 0.91 } }),
      row({ id: 'high', possibleDuplicateOf: { id: 'y', title: 'Y', similarity: 0.98 } }),
    ])
    expect(pairs.map((p) => p.duplicate.id)).toEqual(['high', 'low'])
  })
})

describe('buildMergePairs: clamping bad similarity', () => {
  it('clamps an out-of-range or non-finite similarity into 0..1', () => {
    const pairs = buildMergePairs([
      row({ id: 'a', possibleDuplicateOf: { id: 'x', title: 'X', similarity: 1.4 } }),
      row({ id: 'b', possibleDuplicateOf: { id: 'y', title: 'Y', similarity: Number.NaN } }),
    ])
    const byId = Object.fromEntries(pairs.map((p) => [p.duplicate.id, p.similarity]))
    expect(byId['a']).toBe(1)
    expect(byId['b']).toBe(0)
  })
})

describe('similarityPercent', () => {
  it('renders a whole-number percent, clamped', () => {
    expect(similarityPercent(0.94)).toBe(94)
    expect(similarityPercent(0)).toBe(0)
    expect(similarityPercent(1)).toBe(100)
    expect(similarityPercent(1.5)).toBe(100)
    expect(similarityPercent(Number.NaN)).toBe(0)
  })
})
