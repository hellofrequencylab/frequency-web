// Pure feed ranking — dedupe by id, sort by the chosen mode, cap the count.
// Split out of components/feed/feed-list.tsx so it's unit-testable. 'relevant'
// sorts by engagement_score (then recency as a tiebreak); 'recent' is recency.

export interface RankablePost {
  id: string
  engagement_score: number | null
  created_at: string
}

export function rankFeedPosts<T extends RankablePost>(
  posts: T[],
  // 'nearby' selects WHICH posts in the DB (the closest, within radius); the final
  // display order is recency, same as 'recent'.
  sort: 'recent' | 'relevant' | 'nearby',
  limit = 20,
): T[] {
  const seen = new Set<string>()
  return posts
    .filter((p) => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })
    .sort((a, b) => {
      if (sort === 'relevant') {
        const diff = (b.engagement_score ?? 0) - (a.engagement_score ?? 0)
        if (diff !== 0) return diff
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    .slice(0, limit)
}
