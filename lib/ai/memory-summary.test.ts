import { describe, it, expect } from 'vitest'
import {
  countFacts,
  needsCompression,
  fallbackDigest,
  coerceDigest,
  clampSummary,
  stalenessOf,
  FACT_COUNT_THRESHOLD,
  SUMMARY_CHARS_THRESHOLD,
  INTERACTION_DRIFT_THRESHOLD,
  STALE_DAYS_THRESHOLD,
  MAX_SUMMARY_CHARS,
  MAX_FACTS_PER_LIST,
  type MemoryStaleness,
} from './memory-summary'
import type { MemberFacts } from './memory'

const list = (n: number, prefix = 'x'): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

const baseStaleness = (over: Partial<MemoryStaleness> = {}): MemoryStaleness => ({
  factCount: 0,
  summaryChars: 0,
  interactionCount: 0,
  summarizedAtInteractionCount: null,
  lastSummarizedAt: null,
  ...over,
})

describe('countFacts', () => {
  it('counts across all list fields plus neighborhood', () => {
    const facts: MemberFacts = { interests: ['a', 'b'], goals: ['c'], constraints: ['d'], neighborhood: 'Mission' }
    expect(countFacts(facts)).toBe(5)
  })

  it('is zero for empty facts', () => {
    expect(countFacts({})).toBe(0)
  })

  it('ignores a null neighborhood', () => {
    expect(countFacts({ neighborhood: null })).toBe(0)
  })
})

describe('needsCompression — selection logic', () => {
  it('skips a small, fresh record', () => {
    expect(needsCompression(baseStaleness({ factCount: 5, summaryChars: 100, interactionCount: 3 }))).toBe(false)
  })

  it('compresses when facts exceed the count threshold', () => {
    expect(needsCompression(baseStaleness({ factCount: FACT_COUNT_THRESHOLD + 1 }))).toBe(true)
  })

  it('does NOT compress exactly at the fact threshold (strictly greater)', () => {
    expect(needsCompression(baseStaleness({ factCount: FACT_COUNT_THRESHOLD }))).toBe(false)
  })

  it('compresses when the summary exceeds the length threshold', () => {
    expect(needsCompression(baseStaleness({ summaryChars: SUMMARY_CHARS_THRESHOLD + 1 }))).toBe(true)
  })

  it('compresses on interaction drift since last summarize', () => {
    // 30 interactions, last summarized at 5 → drift 25 ≥ threshold.
    expect(
      needsCompression(
        baseStaleness({
          interactionCount: 5 + INTERACTION_DRIFT_THRESHOLD,
          summarizedAtInteractionCount: 5,
          lastSummarizedAt: new Date().toISOString(),
        }),
      ),
    ).toBe(true)
  })

  it('treats never-summarized as drift from zero', () => {
    expect(
      needsCompression(baseStaleness({ interactionCount: INTERACTION_DRIFT_THRESHOLD, summarizedAtInteractionCount: null })),
    ).toBe(true)
  })

  it('does not compress for small drift', () => {
    expect(
      needsCompression(
        baseStaleness({
          interactionCount: 5 + (INTERACTION_DRIFT_THRESHOLD - 1),
          summarizedAtInteractionCount: 5,
          lastSummarizedAt: new Date().toISOString(),
        }),
      ),
    ).toBe(false)
  })

  it('compresses a stale, previously-summarized record with content', () => {
    const now = new Date('2026-06-14T00:00:00Z')
    const old = new Date('2026-04-01T00:00:00Z').toISOString() // > 30d earlier
    expect(needsCompression(baseStaleness({ factCount: 3, lastSummarizedAt: old }), now)).toBe(true)
  })

  it('does NOT treat an empty stale record as due (nothing to compress)', () => {
    const now = new Date('2026-06-14T00:00:00Z')
    const old = new Date('2026-04-01T00:00:00Z').toISOString()
    expect(needsCompression(baseStaleness({ factCount: 0, summaryChars: 0, lastSummarizedAt: old }), now)).toBe(false)
  })

  it('does not treat a recently-summarized record as stale', () => {
    const now = new Date('2026-06-14T00:00:00Z')
    const recent = new Date(now.getTime() - (STALE_DAYS_THRESHOLD - 1) * 86_400_000).toISOString()
    expect(needsCompression(baseStaleness({ factCount: 3, lastSummarizedAt: recent }), now)).toBe(false)
  })
})

describe('stalenessOf', () => {
  it('projects a context + markers into the staleness shape', () => {
    const s = stalenessOf(
      { summary: 'hello', facts: { interests: ['a', 'b'] }, interactionCount: 12 },
      { summarizedAtInteractionCount: 4, lastSummarizedAt: '2026-01-01T00:00:00Z' },
    )
    expect(s).toEqual({
      factCount: 2,
      summaryChars: 5,
      interactionCount: 12,
      summarizedAtInteractionCount: 4,
      lastSummarizedAt: '2026-01-01T00:00:00Z',
    })
  })
})

describe('clampSummary', () => {
  it('leaves short summaries untouched', () => {
    expect(clampSummary('  a short one  ')).toBe('a short one')
  })

  it('clamps long summaries to the cap', () => {
    const long = 'word '.repeat(400) // 2000 chars
    const out = clampSummary(long)
    expect(out.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS)
    expect(out.length).toBeGreaterThan(0)
  })
})

describe('fallbackDigest — deterministic compression', () => {
  it('keeps the freshest (tail) facts when over the per-list cap', () => {
    const facts: MemberFacts = { interests: list(MAX_FACTS_PER_LIST + 5) }
    const d = fallbackDigest({ summary: 's', facts })
    expect(d.facts.interests).toHaveLength(MAX_FACTS_PER_LIST)
    // Tail kept → last element preserved, first dropped.
    expect(d.facts.interests).toContain(`x${MAX_FACTS_PER_LIST + 4}`)
    expect(d.facts.interests).not.toContain('x0')
  })

  it('preserves lists under the cap unchanged', () => {
    const facts: MemberFacts = { goals: ['g1', 'g2'] }
    expect(fallbackDigest({ summary: '', facts }).facts.goals).toEqual(['g1', 'g2'])
  })

  it('omits empty lists', () => {
    const d = fallbackDigest({ summary: 's', facts: { interests: [] } })
    expect(d.facts.interests).toBeUndefined()
  })

  it('clamps an over-long summary', () => {
    const d = fallbackDigest({ summary: 'word '.repeat(400), facts: {} })
    expect(d.summary.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS)
  })

  it('preserves neighborhood', () => {
    expect(fallbackDigest({ summary: '', facts: { neighborhood: 'Mission' } }).facts.neighborhood).toBe('Mission')
  })

  it('handles a null summary', () => {
    expect(fallbackDigest({ summary: null, facts: {} }).summary).toBe('')
  })
})

describe('coerceDigest — clamping the model output', () => {
  const source = { summary: 'old summary', facts: { interests: ['keep'], goals: ['g'] } as MemberFacts }

  it('accepts a valid model digest and clamps lists', () => {
    const d = coerceDigest({ summary: 'tight', interests: list(MAX_FACTS_PER_LIST + 3) }, source)
    expect(d.summary).toBe('tight')
    expect(d.facts.interests).toHaveLength(MAX_FACTS_PER_LIST)
  })

  it('dedupes case-insensitively in model lists', () => {
    const d = coerceDigest({ summary: 's', interests: ['Yoga', 'yoga', 'YOGA'] }, source)
    expect(d.facts.interests).toEqual(['Yoga'])
  })

  it('clamps an over-long model summary', () => {
    const d = coerceDigest({ summary: 'word '.repeat(400) }, source)
    expect(d.summary.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS)
  })

  it('falls back to source facts when the model omits a list', () => {
    // No interests/goals in raw → keep the source's.
    const d = coerceDigest({ summary: 'tight' }, source)
    expect(d.facts.interests).toEqual(['keep'])
    expect(d.facts.goals).toEqual(['g'])
  })

  it('falls back entirely on a non-object input', () => {
    const d = coerceDigest('garbage', source)
    expect(d.summary).toBe('old summary')
    expect(d.facts.interests).toEqual(['keep'])
  })

  it('never empties a non-empty record', () => {
    // Model returns an empty summary and empty lists → must fall back to source.
    const d = coerceDigest({ summary: '', interests: [], goals: [] }, source)
    expect(d.summary || countFacts(d.facts)).toBeTruthy()
  })

  it('overrides neighborhood when the model provides one', () => {
    const d = coerceDigest({ summary: 's', neighborhood: 'Soma' }, { summary: 's', facts: { neighborhood: 'Mission' } })
    expect(d.facts.neighborhood).toBe('Soma')
  })

  it('keeps the source neighborhood when the model omits it', () => {
    const d = coerceDigest({ summary: 's' }, { summary: 's', facts: { neighborhood: 'Mission' } })
    expect(d.facts.neighborhood).toBe('Mission')
  })
})
