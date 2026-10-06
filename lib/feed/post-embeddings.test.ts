import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/ai/embed', () => ({ embedText: async () => [] }))

import { buildPostText } from './post-embeddings'
import { interestFromSimilarity } from './post-interest'

// LIVE-677: what a post is embedded from, and how a cosine similarity becomes the blend's term.

describe('buildPostText', () => {
  it('embeds the body, collapsed and capped', () => {
    expect(buildPostText('  Sunrise   breathwork\n on the beach  ')).toBe('Sunrise breathwork on the beach')
    expect(buildPostText('x'.repeat(5000))!.length).toBe(2000)
  })

  it('skips a post with nothing to say', () => {
    expect(buildPostText(null)).toBeNull()
    expect(buildPostText('   ')).toBeNull()
    expect(buildPostText('nice!')).toBeNull()
  })
})

describe('interestFromSimilarity', () => {
  it('maps the useful gte-small band onto 0..1 and clamps the rest', () => {
    expect(interestFromSimilarity(0.6)).toBe(0)
    expect(interestFromSimilarity(0.95)).toBe(1)
    expect(interestFromSimilarity(0.775)).toBeCloseTo(0.5)
    expect(interestFromSimilarity(0.2)).toBe(0)
    expect(interestFromSimilarity(1.2)).toBe(1)
    expect(interestFromSimilarity(Number.NaN)).toBe(0)
  })
})
