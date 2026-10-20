import { describe, it, expect } from 'vitest'
import {
  filterChannels,
  sortChannels,
  trendingChannels,
  threadExcerpt,
  parseChannelSort,
  activityLine,
  type ForumChannel,
} from './forum-index'

function ch(over: Partial<ForumChannel> & { id: string; name: string }): ForumChannel {
  return {
    slug: over.id,
    category: 'mind',
    description: null,
    coverImage: null,
    theme: null,
    pillarId: 'p1',
    pillarName: 'Mind',
    pillarSlug: 'mind',
    members: 0,
    circles: 0,
    threads: 0,
    recentThreads: 0,
    lastPostAt: null,
    latest: null,
    hasPinned: false,
    tunedIn: false,
    ...over,
  }
}

const LATEST = { excerpt: 'hello', author: 'A', at: '2026-10-01T00:00:00Z' }
const LIST = [
  ch({ id: 'a', name: 'Breathwork', members: 40, circles: 2, threads: 9, recentThreads: 1, lastPostAt: '2026-10-10T00:00:00Z', latest: LATEST, tunedIn: true }),
  ch({ id: 'b', name: 'Cold plunge', members: 10, circles: 5, threads: 3, recentThreads: 6, lastPostAt: '2026-10-18T00:00:00Z', latest: LATEST, pillarId: 'p2', pillarName: 'Body', pillarSlug: 'body' }),
  ch({ id: 'c', name: 'Ambient music', members: 25, circles: 0, description: 'Slow sound for evenings', pillarId: 'p3', pillarName: 'Expression', pillarSlug: 'expression' }),
]

describe('sortChannels', () => {
  it('most active leads with this fortnight, and a quiet Channel sorts last', () => {
    expect(sortChannels(LIST, 'active').map((c) => c.id)).toEqual(['b', 'a', 'c'])
  })
  it('sorts by tuned in, Circles and name', () => {
    expect(sortChannels(LIST, 'tuned').map((c) => c.id)).toEqual(['a', 'c', 'b'])
    expect(sortChannels(LIST, 'circles').map((c) => c.id)).toEqual(['b', 'a', 'c'])
    expect(sortChannels(LIST, 'az').map((c) => c.id)).toEqual(['c', 'a', 'b'])
  })
  it('never mutates its input', () => {
    const before = LIST.map((c) => c.id).join()
    sortChannels(LIST, 'az')
    expect(LIST.map((c) => c.id).join()).toBe(before)
  })
})

describe('filterChannels', () => {
  it('searches name, description and Pillar', () => {
    expect(filterChannels(LIST, { q: 'plunge' }).map((c) => c.id)).toEqual(['b'])
    expect(filterChannels(LIST, { q: 'evenings' }).map((c) => c.id)).toEqual(['c'])
    expect(filterChannels(LIST, { q: 'body' }).map((c) => c.id)).toEqual(['b'])
  })
  it('narrows by Pillar and by tuned in', () => {
    expect(filterChannels(LIST, { pillar: 'expression' }).map((c) => c.id)).toEqual(['c'])
    expect(filterChannels(LIST, { show: 'tuned' }).map((c) => c.id)).toEqual(['a'])
    expect(filterChannels(LIST, { show: 'explore' }).map((c) => c.id)).toEqual(['b', 'c'])
  })
})

describe('trendingChannels', () => {
  it('lists only Channels with talk this fortnight, most first, capped', () => {
    expect(trendingChannels(LIST, 3).map((c) => c.id)).toEqual(['b', 'a'])
    expect(trendingChannels(LIST, 1).map((c) => c.id)).toEqual(['b'])
  })
})

describe('threadExcerpt', () => {
  it('drops links and marks, and cuts at a word with an ellipsis', () => {
    expect(threadExcerpt('**Hi** there https://x.test/a')).toBe('Hi there')
    const long = threadExcerpt('word '.repeat(60), 40)
    expect(long.endsWith('…')).toBe(true)
    expect(long.length).toBeLessThanOrEqual(41)
  })
  it('is total on null', () => {
    expect(threadExcerpt(null)).toBe('')
  })
})

describe('small readers', () => {
  it('falls back to most active on a bad sort', () => {
    expect(parseChannelSort('nope')).toBe('active')
    expect(parseChannelSort('az')).toBe('az')
  })
  it('says nothing for a Channel with no threads', () => {
    expect(activityLine({ recentThreads: 0, threads: 0 })).toBeNull()
    expect(activityLine({ recentThreads: 1, threads: 4 })).toBe('1 thread lately')
    expect(activityLine({ recentThreads: 0, threads: 4 })).toBe('4 threads')
  })
})
