import { describe, it, expect } from 'vitest'
import { rankFeedPosts, type RankablePost } from './feed-rank'

const p = (id: string, engagement_score: number | null, created_at: string): RankablePost => ({
  id,
  engagement_score,
  created_at,
})

describe('rankFeedPosts', () => {
  it("'relevant' sorts by engagement_score, recency breaks ties", () => {
    const out = rankFeedPosts(
      [
        p('a', 5, '2026-06-01T00:00:00Z'),
        p('b', 9, '2026-06-01T00:00:00Z'),
        p('c', 9, '2026-06-02T00:00:00Z'), // same score as b, newer
      ],
      'relevant',
    )
    expect(out.map((x) => x.id)).toEqual(['c', 'b', 'a'])
  })

  it("'recent' sorts purely by created_at desc, ignoring score", () => {
    const out = rankFeedPosts(
      [
        p('old-high', 100, '2026-06-01T00:00:00Z'),
        p('new-low', 1, '2026-06-03T00:00:00Z'),
      ],
      'recent',
    )
    expect(out.map((x) => x.id)).toEqual(['new-low', 'old-high'])
  })

  it('dedupes by id (first occurrence wins)', () => {
    const out = rankFeedPosts(
      [p('a', 1, '2026-06-01T00:00:00Z'), p('a', 1, '2026-06-01T00:00:00Z'), p('b', 2, '2026-06-02T00:00:00Z')],
      'recent',
    )
    expect(out.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('caps to the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => p(`p${i}`, i, `2026-06-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`))
    expect(rankFeedPosts(many, 'relevant', 20)).toHaveLength(20)
  })

  it('treats null engagement_score as 0', () => {
    const out = rankFeedPosts(
      [p('null', null, '2026-06-02T00:00:00Z'), p('pos', 3, '2026-06-01T00:00:00Z')],
      'relevant',
    )
    expect(out.map((x) => x.id)).toEqual(['pos', 'null'])
  })
})
