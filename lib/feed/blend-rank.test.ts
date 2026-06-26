import { describe, it, expect } from 'vitest'
import { blendScore, blendRank, diversityRerank, type BlendContext, type BlendableItem } from './blend-rank'

const NOW = new Date('2026-06-26T12:00:00Z').getTime()

function ctx(over: Partial<BlendContext> = {}): BlendContext {
  return { nowMs: NOW, resonance: new Map(), radiusM: 25000, ...over }
}

function item(over: Partial<BlendableItem> = {}): BlendableItem {
  return { id: 'i', authorId: 'a', created_at: new Date(NOW).toISOString(), ...over }
}

describe('blendScore', () => {
  it('is in [0,1] and decays with age (recency)', () => {
    const fresh = blendScore(item({ created_at: new Date(NOW).toISOString() }), ctx())
    const old = blendScore(item({ created_at: new Date(NOW - 7 * 24 * 3600_000).toISOString() }), ctx())
    expect(fresh).toBeGreaterThan(old)
    expect(fresh).toBeLessThanOrEqual(1)
    expect(old).toBeGreaterThanOrEqual(0)
  })

  it('a resonant author outranks a stranger, all else equal', () => {
    const c = ctx({ resonance: new Map([['friend', 1]]) })
    const resonant = blendScore(item({ authorId: 'friend' }), c)
    const stranger = blendScore(item({ authorId: 'nobody' }), c)
    expect(resonant).toBeGreaterThan(stranger)
  })

  it('proximity rewards nearer posts when a distance is present', () => {
    const near = blendScore(item({ distance_m: 500 }), ctx())
    const far = blendScore(item({ distance_m: 24000 }), ctx())
    expect(near).toBeGreaterThan(far)
  })

  it('a missing signal is NOT a penalty (weight redistributes)', () => {
    // Two identical posts; one carries a distance (proximity present), one does not.
    // The one with no distance must not be dragged below — it just blends fewer signals.
    const withDist = blendScore(item({ distance_m: null }), ctx())
    expect(withDist).toBeGreaterThan(0)
    expect(withDist).toBeLessThanOrEqual(1)
  })

  it('engagement saturates (a huge score cannot swamp the blend)', () => {
    const hot = blendScore(item({ engagement_score: 10_000 }), ctx())
    const warm = blendScore(item({ engagement_score: 40 }), ctx())
    expect(hot).toBeGreaterThan(warm)
    expect(hot).toBeLessThanOrEqual(1)
  })

  it('an announcement gets a small additive nudge', () => {
    const plain = blendScore(item({ post_type: 'post' }), ctx())
    const announce = blendScore(item({ post_type: 'announcement' }), ctx())
    expect(announce).toBeGreaterThan(plain)
    expect(announce - plain).toBeLessThanOrEqual(0.05 + 1e-9)
  })

  it('with no resonance and no geo, newer beats older (reduces to recency-led)', () => {
    const a = blendScore(item({ id: 'a', created_at: new Date(NOW).toISOString() }), ctx())
    const b = blendScore(item({ id: 'b', created_at: new Date(NOW - 48 * 3600_000).toISOString() }), ctx())
    expect(a).toBeGreaterThan(b)
  })
})

describe('diversityRerank', () => {
  it('caps an author to maxPerAuthor in the primary band, deferring extras', () => {
    const items: BlendableItem[] = [
      item({ id: '1', authorId: 'x' }),
      item({ id: '2', authorId: 'x' }),
      item({ id: '3', authorId: 'x' }),
      item({ id: '4', authorId: 'y' }),
    ]
    const out = diversityRerank(items, 2)
    // x's third item is pushed behind y's first.
    expect(out.map((i) => i.id)).toEqual(['1', '2', '4', '3'])
  })

  it('is a no-op when every author is within the cap', () => {
    const items: BlendableItem[] = [item({ id: '1', authorId: 'x' }), item({ id: '2', authorId: 'y' })]
    expect(diversityRerank(items, 2).map((i) => i.id)).toEqual(['1', '2'])
  })
})

describe('blendRank', () => {
  it('dedupes by id, ranks, and caps to the limit', () => {
    const items: BlendableItem[] = [
      item({ id: 'dup', authorId: 'a', created_at: new Date(NOW).toISOString() }),
      item({ id: 'dup', authorId: 'a', created_at: new Date(NOW).toISOString() }),
      item({ id: 'old', authorId: 'b', created_at: new Date(NOW - 100 * 3600_000).toISOString() }),
    ]
    const out = blendRank(items, ctx(), 5)
    expect(out.map((i) => i.id)).toEqual(['dup', 'old'])
  })

  it('puts the resonant + near + fresh post on top', () => {
    const c = ctx({ resonance: new Map([['friend', 1]]) })
    const items: BlendableItem[] = [
      item({ id: 'stranger-old', authorId: 'z', created_at: new Date(NOW - 72 * 3600_000).toISOString() }),
      item({ id: 'friend-near-fresh', authorId: 'friend', distance_m: 300, created_at: new Date(NOW).toISOString() }),
    ]
    expect(blendRank(items, c, 5)[0].id).toBe('friend-near-fresh')
  })
})
